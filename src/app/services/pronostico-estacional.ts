import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface LimitesRaster {
  oeste: number;
  sur: number;
  este: number;
  norte: number;
}

export interface EscalaRaster {
  nombre: string;
  unidad: string;
  minimo: number;
  maximo: number;
  colores?: string[];
}

export interface CapaPronostico {
  id: number;
  fecha_corrida: string;
  periodo: string;
  mes: string;
  anio: number;
  variable: 'lluvia' | 'tmax' | 'tmin';
  unidad: string;
  resolucion_fuente: string;
  resolucion_archivo: string;
  crs: string;
  ancho: number;
  alto: number;
  nodata: number | null;
  limites: LimitesRaster;
  escala: EscalaRaster;
}

export interface RespuestaCapas {
  fecha_corrida: string;
  periodos: string[];
  total_capas: number;
  capas: CapaPronostico[];
}

export interface PronosticoMensual {
  periodo: string;
  mes?: string;
  anio?: number;
  lluvia?: number | null;
  tmax?: number | null;
  tmin?: number | null;
}

export interface RespuestaPunto {
  lat: number;
  lon: number;
  uso_suelo?: {
    clave?: string;
    descripcion?: string;
  } | null;
  pronostico: PronosticoMensual[];
}

@Injectable({
  providedIn: 'root'
})
export class PronosticoEstacionalService {

  private readonly apiUrl =
    '/wrf-api/api/pronostico-estacional';

  constructor(private http: HttpClient) {}

  obtenerCapas(): Observable<RespuestaCapas> {
    return this.http.get<RespuestaCapas>(
      `${this.apiUrl}/capas`
    );
  }

  consultarPunto(
    lat: number,
    lon: number
  ): Observable<RespuestaPunto> {
    const params = new HttpParams()
      .set('lat', lat.toString())
      .set('lon', lon.toString());

    return this.http.get<RespuestaPunto>(
      `${this.apiUrl}/punto`,
      { params }
    );
  }

  obtenerUrlRaster(capaId: number): string {
    return `${this.apiUrl}/raster/${capaId}.png`;
  }

  obtenerUrlUsoSuelo(): string {
    return `${this.apiUrl}/uso-suelo/{z}/{x}/{y}.pbf`;
  }
}