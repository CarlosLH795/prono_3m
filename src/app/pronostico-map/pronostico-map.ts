import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  OnDestroy
} from '@angular/core';

import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import {
  finalize,
  Subscription,
  timeout
} from 'rxjs';

import * as L from 'leaflet';

import {
  CapaPronostico,
  PronosticoEstacionalService,
  RespuestaPunto
} from '../services/pronostico-estacional';

type VariablePronostico = 'lluvia' | 'tmax' | 'tmin';

@Component({
  selector: 'app-pronostico-map',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule
  ],
  templateUrl: './pronostico-map.html',
  styleUrl: './pronostico-map.css'
})
export class PronosticoMap
  implements AfterViewInit, OnDestroy {

  private mapa?: L.Map;
  private marcador?: L.CircleMarker;

  private readonly suscripciones = new Subscription();
  private consultaPunto?: Subscription;
  private observadorTamano?: ResizeObserver;
  private temporizadorInicio?: ReturnType<typeof setTimeout>;

  private destruido = false;

  capas: CapaPronostico[] = [];
  periodos: string[] = [];

  periodoSeleccionado = '';
  variableSeleccionada: VariablePronostico = 'lluvia';

  fechaCorrida = '';
  urlImagenActual = '';
  opacidad = 0.72;

  cargandoCapas = true;
  cargandoMapa = true;
  consultandoPunto = false;

  error = '';

  punto?: RespuestaPunto;
  latSeleccionada?: number;
  lonSeleccionada?: number;

  constructor(
    private readonly pronosticoService: PronosticoEstacionalService,
    private readonly detector: ChangeDetectorRef
  ) {}

  ngAfterViewInit(): void {
    // Espera a que Angular haya creado el contenedor del mapa.
    this.temporizadorInicio = setTimeout(() => {
      if (this.destruido) {
        return;
      }

      this.crearMapa();
      this.cargarCatalogo();
    }, 0);
  }

  ngOnDestroy(): void {
    this.destruido = true;

    if (this.temporizadorInicio !== undefined) {
      clearTimeout(this.temporizadorInicio);
    }

    this.consultaPunto?.unsubscribe();
    this.suscripciones.unsubscribe();
    this.observadorTamano?.disconnect();

    this.mapa?.remove();
    this.mapa = undefined;
  }

  private actualizarVista(): void {
    if (!this.destruido) {
      // Notifica también a Angular cuando se utiliza sin Zone.js.
      this.detector.markForCheck();
    }
  }

  private crearMapa(): void {
    const elemento = document.getElementById('mapa-pronostico');

    if (!elemento) {
      this.cargandoMapa = false;
      this.error = 'No se encontró el contenedor del mapa.';
      this.actualizarVista();
      return;
    }

    if (this.mapa) {
      this.mapa.invalidateSize();
      return;
    }

    try {
      this.mapa = L.map(elemento, {
        center: [23.6, -102.5],
        zoom: 5,
        minZoom: 4,
        maxZoom: 17,
        zoomControl: true
      });

      // Imagen satelital.
      const satelite = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/' +
        'World_Imagery/MapServer/tile/{z}/{y}/{x}',
        {
          attribution: 'Tiles &copy; Esri',
          maxZoom: 19
        }
      );

      satelite.on('tileerror', () => {
        if (this.destruido) {
          return;
        }

        this.error =
          'No se pudieron cargar algunas imágenes del mapa satelital. ' +
          'Revisa la conexión a Internet.';

        this.actualizarVista();
      });

      satelite.addTo(this.mapa);

      // Referencia de lugares y límites disponibles en esta capa.
      L.tileLayer(
        'https://services.arcgisonline.com/ArcGIS/rest/services/' +
        'Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
        {
          attribution: 'Referencia &copy; Esri',
          maxZoom: 19
        }
      ).addTo(this.mapa);

      this.mapa.on('click', (evento: L.LeafletMouseEvent) => {
        this.consultarPunto(
          evento.latlng.lat,
          evento.latlng.lng
        );
      });

      // Ajusta Leaflet cuando cambia el tamaño del panel,
      // por ejemplo, al aparecer la imagen del pronóstico.
      if (typeof ResizeObserver !== 'undefined') {
        this.observadorTamano = new ResizeObserver(() => {
          if (!this.destruido) {
            this.mapa?.invalidateSize({
              animate: false,
              pan: false
            });
          }
        });

        this.observadorTamano.observe(elemento);
      }

      this.mapa.invalidateSize({
        animate: false,
        pan: false
      });

      this.cargandoMapa = false;
      this.actualizarVista();

    } catch (error) {
      console.error('Error inicializando el mapa:', error);

      this.mapa?.remove();
      this.mapa = undefined;

      this.cargandoMapa = false;
      this.error = 'No fue posible inicializar el mapa.';
      this.actualizarVista();
    }
  }

  private cargarCatalogo(): void {
    this.cargandoCapas = true;
    this.error = '';
    this.actualizarVista();

    const suscripcion = this.pronosticoService
      .obtenerCapas()
      .pipe(
        timeout(30000),
        finalize(() => {
          this.cargandoCapas = false;

          // Se actualiza DESPUÉS de quitar el estado de carga.
          this.actualizarVista();
        })
      )
      .subscribe({
        next: respuesta => {
          this.fechaCorrida = respuesta.fecha_corrida ?? '';
          this.capas = respuesta.capas ?? [];

          const periodosDisponibles =
            respuesta.periodos?.length
              ? respuesta.periodos
              : this.capas.map(capa => capa.periodo);

          this.periodos = [...new Set(periodosDisponibles)];

          if (!this.capas.length || !this.periodos.length) {
            this.periodoSeleccionado = '';
            this.urlImagenActual = '';
            this.error = 'La API no devolvió capas de pronóstico.';
            this.actualizarVista();
            return;
          }

          this.periodoSeleccionado = this.periodos[0];
          this.variableSeleccionada = this.obtenerPrimeraVariable();

          this.mostrarCapaSeleccionada();
        },

        error: error => {
          console.error('Error cargando el catálogo:', error);

          this.capas = [];
          this.periodos = [];
          this.periodoSeleccionado = '';
          this.urlImagenActual = '';

          this.error =
            'No fue posible cargar el catálogo del pronóstico. ' +
            'Revisa la conexión con la API.';

          this.actualizarVista();
        }
      });

    this.suscripciones.add(suscripcion);
  }

  private obtenerPrimeraVariable(): VariablePronostico {
    const variables = this.capas
      .filter(capa =>
        capa.periodo === this.periodoSeleccionado
      )
      .map(capa => capa.variable);

    if (variables.includes('lluvia')) {
      return 'lluvia';
    }

    if (variables.includes('tmax')) {
      return 'tmax';
    }

    return 'tmin';
  }

  alCambiarPeriodo(): void {
    // Conserva la variable elegida si existe para el nuevo mes.
    if (!this.capaActual) {
      this.variableSeleccionada = this.obtenerPrimeraVariable();
    }

    this.mostrarCapaSeleccionada();
  }

  alCambiarVariable(): void {
    this.mostrarCapaSeleccionada();
  }

  mostrarCapaSeleccionada(): void {
  const capa = this.capaActual;

  if (!capa) {
    this.urlImagenActual = '';
    this.error = 'No existe una capa para la selección actual.';
    this.actualizarVista();
    return;
  }

  this.error = '';

  const periodo = String(capa.periodo).slice(0, 7);

  this.urlImagenActual =
    '/wrf-api/api/pronostico-estacional/imagenes/' +
    encodeURIComponent(capa.variable) +
    '/' +
    encodeURIComponent(periodo) +
    '.png';

  this.actualizarVista();
}

  cambiarOpacidad(): void {
    // El HTML aplica este valor mediante [style.opacity].
    this.actualizarVista();
  }

  consultarPunto(lat: number, lon: number): void {
    if (!this.mapa || this.destruido) {
      return;
    }

    // Cancela la consulta anterior si el usuario selecciona otro punto.
    this.consultaPunto?.unsubscribe();

    this.latSeleccionada = lat;
    this.lonSeleccionada = lon;

    this.punto = undefined;
    this.consultandoPunto = true;
    this.error = '';

    if (this.marcador) {
      this.marcador.setLatLng([lat, lon]);
    } else {
      this.marcador = L.circleMarker(
        [lat, lon],
        {
          radius: 7,
          color: '#ffffff',
          weight: 3,
          fillColor: '#e65100',
          fillOpacity: 1
        }
      ).addTo(this.mapa);
    }

    this.actualizarVista();

    this.consultaPunto = this.pronosticoService
      .consultarPunto(lat, lon)
      .pipe(
        timeout(30000),
        finalize(() => {
          this.consultandoPunto = false;
          this.actualizarVista();
        })
      )
      .subscribe({
        next: respuesta => {
          this.punto = respuesta;
          this.actualizarVista();
        },

        error: error => {
          console.error('Error consultando el punto:', error);

          this.punto = undefined;
          this.error =
            'No fue posible consultar el pronóstico en ese punto.';

          this.actualizarVista();
        }
      });
  }

  get capaActual(): CapaPronostico | undefined {
    return this.capas.find(capa =>
      capa.periodo === this.periodoSeleccionado &&
      capa.variable === this.variableSeleccionada
    );
  }

  // Compatibilidad si el HTML anterior todavía utiliza este nombre.
  get urlImagenCapa(): string {
    return this.urlImagenActual;
  }

  nombreVariable(variable: string): string {
    const nombres: Record<string, string> = {
      lluvia: 'Precipitación mensual',
      tmax: 'Temperatura máxima',
      tmin: 'Temperatura mínima'
    };

    return nombres[variable] ?? variable;
  }

  valorPronostico(
    fila: any,
    variable: VariablePronostico
  ): number | null {
    const campos: Record<VariablePronostico, string[]> = {
      lluvia: [
        'lluvia',
        'lluvia_mm',
        'precipitacion',
        'precipitacion_mm'
      ],
      tmax: [
        'tmax',
        'tmax_c',
        'temperatura_maxima'
      ],
      tmin: [
        'tmin',
        'tmin_c',
        'temperatura_minima'
      ]
    };

    for (const campo of campos[variable]) {
      const valor = fila?.[campo];

      if (
        valor === null ||
        valor === undefined ||
        valor === ''
      ) {
        continue;
      }

      const numero = Number(valor);

      if (Number.isFinite(numero)) {
        return numero;
      }
    }

    return null;
  }
}