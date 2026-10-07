import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  OnDestroy
} from '@angular/core';

import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { finalize, Subscription, timeout } from 'rxjs';

import * as L from 'leaflet';

import {
  CapaPronostico,
  EstadoPronostico,
  MunicipioIdentificado,
  PronosticoEstacionalService,
  PronosticoMunicipal,
  RespuestaMunicipios,
  RespuestaPunto,
  VariablePronostico
} from '../services/pronostico-estacional';

@Component({
  selector: 'app-pronostico-map',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './pronostico-map.html',
  styleUrl: './pronostico-map.css'
})
export class PronosticoMap implements AfterViewInit, OnDestroy {
  private mapa?: L.Map;
  private marcador?: L.CircleMarker;

  private readonly suscripciones = new Subscription();
  private consultaPunto?: Subscription;
  private consultaUbicacion?: Subscription;
  private consultaMunicipios?: Subscription;

  private observadorTamano?: ResizeObserver;
  private temporizadorInicio?: ReturnType<typeof setTimeout>;
  private destruido = false;

  private versionPunto = 0;
  private versionUbicacion = 0;
  private versionMunicipios = 0;

  capas: CapaPronostico[] = [];
  periodos: string[] = [];
  estados: EstadoPronostico[] = [];
  municipios: PronosticoMunicipal[] = [];

  periodoSeleccionado = '';
  variableSeleccionada: VariablePronostico = 'lluvia';
  estadoSeleccionado = '';

  fechaCorrida = '';
  urlImagenActual = '';
  opacidad = 0.72;

  cargandoCapas = true;
  cargandoMapa = true;
  cargandoEstados = true;
  cargandoMunicipios = false;
  consultandoPunto = false;
  consultandoMunicipio = false;

  error = '';
  errorEstados = '';
  errorMunicipios = '';
  avisoMunicipio = '';

  punto?: RespuestaPunto;
  latSeleccionada?: number;
  lonSeleccionada?: number;

  municipioSeleccionado?: MunicipioIdentificado;
  cvegeoSeleccionado = '';
  respuestaMunicipios?: RespuestaMunicipios;

  constructor(
    private readonly pronosticoService: PronosticoEstacionalService,
    private readonly detector: ChangeDetectorRef
  ) {}

  ngAfterViewInit(): void {
    this.temporizadorInicio = setTimeout(() => {
      if (this.destruido) {
        return;
      }

      this.crearMapa();
      this.cargarCatalogo();
      this.cargarEstados();
    }, 0);
  }

  ngOnDestroy(): void {
    this.destruido = true;

    if (this.temporizadorInicio !== undefined) {
      clearTimeout(this.temporizadorInicio);
    }

    this.consultaPunto?.unsubscribe();
    this.consultaUbicacion?.unsubscribe();
    this.consultaMunicipios?.unsubscribe();
    this.suscripciones.unsubscribe();
    this.observadorTamano?.disconnect();

    this.mapa?.remove();
    this.mapa = undefined;
  }

  private actualizarVista(): void {
    if (!this.destruido) {
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

      const satelite = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/' +
        'World_Imagery/MapServer/tile/{z}/{y}/{x}',
        {
          attribution: 'Tiles &copy; Esri',
          maxZoom: 19
        }
      );

      satelite.on('tileerror', () => {
        if (!this.destruido) {
          this.error =
            'No se pudieron cargar algunas imágenes del mapa satelital. ' +
            'Revisa la conexión a Internet.';
          this.actualizarVista();
        }
      });

      satelite.addTo(this.mapa);

      L.tileLayer(
        'https://services.arcgisonline.com/ArcGIS/rest/services/' +
        'Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
        {
          attribution: 'Referencia &copy; Esri',
          maxZoom: 19
        }
      ).addTo(this.mapa);

      this.mapa.on('click', (evento: L.LeafletMouseEvent) => {
        this.consultarPunto(evento.latlng.lat, evento.latlng.lng);
      });

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

      this.mapa.invalidateSize({ animate: false, pan: false });
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

    const suscripcion = this.pronosticoService.obtenerCapas()
      .pipe(
        timeout(30000),
        finalize(() => {
          this.cargandoCapas = false;
          this.actualizarVista();
        })
      )
      .subscribe({
        next: respuesta => {
          this.fechaCorrida = respuesta.fecha_corrida ?? '';
          this.capas = respuesta.capas ?? [];

          const disponibles = respuesta.periodos?.length
            ? respuesta.periodos
            : this.capas.map(capa => capa.periodo);

          this.periodos = [...new Set(disponibles)].sort();

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
            'No fue posible cargar el catálogo del pronóstico.';
          this.actualizarVista();
        }
      });

    this.suscripciones.add(suscripcion);
  }

  private cargarEstados(): void {
    this.cargandoEstados = true;
    this.errorEstados = '';

    const suscripcion = this.pronosticoService.obtenerEstados()
      .pipe(
        timeout(30000),
        finalize(() => {
          this.cargandoEstados = false;
          this.actualizarVista();
        })
      )
      .subscribe({
        next: respuesta => {
          this.estados = respuesta.estados ?? [];

          if (!this.estados.length) {
            this.errorEstados = 'No hay estados disponibles.';
          }

          this.actualizarVista();
        },
        error: error => {
          console.error('Error consultando estados:', error);
          this.estados = [];
          this.errorEstados = 'No fue posible cargar los estados.';
          this.actualizarVista();
        }
      });

    this.suscripciones.add(suscripcion);
  }

  private obtenerPrimeraVariable(): VariablePronostico {
    const variables = this.capas
      .filter(capa => capa.periodo === this.periodoSeleccionado)
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
    } else {
      this.error = '';
      this.urlImagenActual = this.pronosticoService.obtenerUrlImagen(
        capa.variable,
        capa.periodo
      );
    }

    // La tabla depende del estado y del mes, no de la variable.
    if (this.estadoSeleccionado && this.periodoSeleccionado) {
      const mismaConsulta =
        this.respuestaMunicipios?.estado.cve_ent ===
          this.estadoSeleccionado &&
        this.respuestaMunicipios?.periodo.slice(0, 7) ===
          this.periodoSeleccionado.slice(0, 7);

      if (!mismaConsulta) {
        this.cargarMunicipios();
      }
    }

    this.actualizarVista();
  }

  cambiarOpacidad(): void {
    this.actualizarVista();
  }

  alCambiarEstado(): void {
    // Una selección manual tiene prioridad sobre una consulta pendiente.
    ++this.versionUbicacion;
    this.consultaUbicacion?.unsubscribe();
    this.consultandoMunicipio = false;

    this.municipioSeleccionado = undefined;
    this.cvegeoSeleccionado = '';
    this.avisoMunicipio = '';

    this.cargarMunicipios();
  }

  cargarMunicipios(): void {
    const version = ++this.versionMunicipios;
    this.consultaMunicipios?.unsubscribe();

    this.municipios = [];
    this.respuestaMunicipios = undefined;
    this.errorMunicipios = '';
    this.cargandoMunicipios = false;

    if (!this.estadoSeleccionado || !this.periodoSeleccionado) {
      this.actualizarVista();
      return;
    }

    this.cargandoMunicipios = true;
    this.actualizarVista();

    this.consultaMunicipios = this.pronosticoService.obtenerMunicipios(
      this.estadoSeleccionado,
      this.periodoSeleccionado
    )
      .pipe(
        timeout(30000),
        finalize(() => {
          if (version === this.versionMunicipios) {
            this.cargandoMunicipios = false;
            this.actualizarVista();
          }
        })
      )
      .subscribe({
        next: respuesta => {
          if (this.destruido || version !== this.versionMunicipios) {
            return;
          }

          this.respuestaMunicipios = respuesta;
this.municipios = respuesta.municipios ?? [];
this.actualizarVista();
this.mostrarMunicipioEnTabla();
        },
        error: error => {
          if (this.destruido || version !== this.versionMunicipios) {
            return;
          }

          console.error('Error consultando municipios:', error);
          this.errorMunicipios =
            'No fue posible consultar los promedios municipales ' +
            'para el estado y mes seleccionados.';
          this.actualizarVista();
        }
      });
  }

  consultarPunto(lat: number, lon: number): void {
    if (!this.mapa || this.destruido) {
      return;
    }

    const version = ++this.versionPunto;
    this.consultaPunto?.unsubscribe();

    this.latSeleccionada = lat;
    this.lonSeleccionada = lon;
    this.punto = undefined;
    this.consultandoPunto = true;
    this.error = '';

    if (this.marcador) {
      this.marcador.setLatLng([lat, lon]);
    } else {
      this.marcador = L.circleMarker([lat, lon], {
        radius: 7,
        color: '#ffffff',
        weight: 3,
        fillColor: '#e65100',
        fillOpacity: 1
      }).addTo(this.mapa);
    }

    this.identificarMunicipio(lat, lon);
    this.actualizarVista();

    this.consultaPunto = this.pronosticoService.consultarPunto(lat, lon)
      .pipe(
        timeout(30000),
        finalize(() => {
          if (version === this.versionPunto) {
            this.consultandoPunto = false;
            this.actualizarVista();
          }
        })
      )
      .subscribe({
        next: respuesta => {
          if (this.destruido || version !== this.versionPunto) {
            return;
          }

          this.punto = respuesta;
          this.actualizarVista();
        },
        error: error => {
          if (this.destruido || version !== this.versionPunto) {
            return;
          }

          console.error('Error consultando el punto:', error);
          this.punto = undefined;
          this.error =
            'No fue posible consultar el pronóstico en ese punto.';
          this.actualizarVista();
        }
      });
  }

  private identificarMunicipio(lat: number, lon: number): void {
    const version = ++this.versionUbicacion;
    this.consultaUbicacion?.unsubscribe();

    this.consultandoMunicipio = true;
    this.municipioSeleccionado = undefined;
    this.cvegeoSeleccionado = '';
    this.avisoMunicipio = '';

    // Retira la tabla del punto anterior mientras identifica el nuevo.
    this.estadoSeleccionado = '';
    this.cargarMunicipios();

    this.consultaUbicacion = this.pronosticoService
      .consultarMunicipioPunto(lat, lon)
      .pipe(
        timeout(30000),
        finalize(() => {
          if (version === this.versionUbicacion) {
            this.consultandoMunicipio = false;
            this.actualizarVista();
          }
        })
      )
      .subscribe({
        next: respuesta => {
          if (this.destruido || version !== this.versionUbicacion) {
            return;
          }

          if (!respuesta.encontrado || !respuesta.municipio) {
            this.avisoMunicipio =
              'El punto no pertenece a un municipio del catálogo. ' +
              'Puedes seleccionar un estado en el menú.';
            this.actualizarVista();
            return;
          }

          this.municipioSeleccionado = respuesta.municipio;
          this.cvegeoSeleccionado = respuesta.municipio.cvegeo;
          this.estadoSeleccionado = respuesta.municipio.cve_ent;
          this.avisoMunicipio = respuesta.nota ?? '';

          this.cargarMunicipios();
          this.actualizarVista();
        },
        error: error => {
          if (this.destruido || version !== this.versionUbicacion) {
            return;
          }

          console.error('Error identificando el municipio:', error);
          this.avisoMunicipio =
            'No fue posible identificar el municipio del punto. ' +
            'Puedes seleccionar un estado en el menú.';
          this.actualizarVista();
        }
      });
  }

  private mostrarMunicipioEnTabla(): void {
  setTimeout(() => {
    if (this.destruido || !this.cvegeoSeleccionado) {
      return;
    }

    // Asegura que Angular haya dibujado las filas nuevas.
    this.detector.detectChanges();

    const tabla = document.querySelector<HTMLElement>(
      '.tabla-municipal'
    );

    const fila = tabla?.querySelector<HTMLElement>(
      'tbody tr[aria-current="true"]'
    );

    if (!tabla || !fila) {
      return;
    }

    const posicionTabla = tabla.getBoundingClientRect();
    const posicionFila = fila.getBoundingClientRect();

    // Centra el municipio seleccionado dentro de la tabla.
    tabla.scrollTop = Math.max(
      0,
      tabla.scrollTop +
      posicionFila.top -
      posicionTabla.top -
      tabla.clientHeight / 2 +
      fila.offsetHeight / 2
    );
  }, 0);
}

  esMunicipioSeleccionado(fila: PronosticoMunicipal): boolean {
    return fila.cvegeo === this.cvegeoSeleccionado;
  }

  get nombreEstadoSeleccionado(): string {
    return this.respuestaMunicipios?.estado.nombre ??
      this.estados.find(
        estado => estado.cve_ent === this.estadoSeleccionado
      )?.nombre ??
      '';
  }

  get capaActual(): CapaPronostico | undefined {
    return this.capas.find(capa =>
      capa.periodo === this.periodoSeleccionado &&
      capa.variable === this.variableSeleccionada
    );
  }

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
    fila: unknown,
    variable: VariablePronostico
  ): number | null {
    if (!fila || typeof fila !== 'object') {
      return null;
    }

    const datos = fila as Record<string, unknown>;

    const campos: Record<VariablePronostico, string[]> = {
      lluvia: [
        'lluvia',
        'lluvia_mm',
        'precipitacion',
        'precipitacion_mm'
      ],
      tmax: ['tmax', 'tmax_c', 'temperatura_maxima'],
      tmin: ['tmin', 'tmin_c', 'temperatura_minima']
    };

    for (const campo of campos[variable]) {
      const valor = datos[campo];

      if (
        valor === null ||
        valor === undefined ||
        valor === '' ||
        (typeof valor !== 'number' && typeof valor !== 'string')
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
  descargarMunicipiosCSV(): void {
  if (!this.municipios.length) {
    return;
  }

  const escaparCSV = (valor: unknown): string => {
    const texto = valor === null || valor === undefined ? '' : String(valor);
    return `"${texto.replace(/"/g, '""')}"`;
  };

  const encabezados = [
    'Municipio',
    'Lluvia (mm)',
    'Temperatura máxima (°C)',
    'Temperatura mínima (°C)'
  ];

  const filas = this.municipios.map(municipio => [
    municipio.municipio,
    municipio.lluvia ?? '',
    municipio.tmax ?? '',
    municipio.tmin ?? ''
  ]);

  const csv = [
    encabezados.map(escaparCSV).join(','),
    ...filas.map(fila => fila.map(escaparCSV).join(','))
  ].join('\r\n');

  // BOM UTF-8 para que Excel reconozca correctamente acentos y ñ.
  const blob = new Blob(['\uFEFF' + csv], {
    type: 'text/csv;charset=utf-8;'
  });

  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');

  const estado = this.nombreEstadoSeleccionado
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_');

  const periodo = this.periodoSeleccionado.slice(0, 7);

  enlace.href = url;
  enlace.download = `pronostico_municipios_${estado}_${periodo}.csv`;

  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);

  URL.revokeObjectURL(url);
}
}