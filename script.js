/**
 * Muestras Web — MTTP Arándano I+D
 * Configuración y constantes (no hardcodear URL de producción).
 */
(function (global) {
  'use strict';

  /** @type {string} Pegar aquí la URL del Web App de Apps Script (Implementar > Implementar como aplicación web) */
  const APPS_SCRIPT_API_URL = 'https://script.google.com/macros/s/AKfycbyn-Cf6Yn28Q5sH40gOui6FD7-2TZGNZGeAurt8d5eEhU2wZg7h6iBL-0tc0dAHw7Tkzg/exec';

  const APP_VERSION = '2.0.0';
  const BORRADOR_AUTOGUARDADO_MS = 500;

  const STORAGE_KEYS = {
    COLA_OFFLINE: 'muestras_web_cola_offline_v2',
    BORRADOR: 'muestras_web_borrador_v2',
    ULTIMO_NUM_MUESTRA: 'muestras_web_ultimo_num_muestra',
    CONFIG_URL: 'muestras_web_apps_script_url',
  };

  const JSONP_DEFAULT_TIMEOUT_MS = 6000;
  const JSONP_REINTENTOS = 1;
  const JSONP_PAUSA_MS = 0;
  /** Pausas entre lecturas JSONP tras POST (patrón MTTP, cold start Apps Script) */
  const POST_CONFIRMACION_PAUSA_1_MS = 900;
  const POST_CONFIRMACION_PAUSA_2_MS = 1400;

  /** Hoja1 — 46 columnas registro campo (índice 1-based en Sheets) */
  const COLS_REGISTRO = {
    UID: 1,
    FECHA_REGISTRO: 2,
    FECHA_COSECHA: 3,
    T_AMBIENTE: 4,
    T_PULPA: 5,
    NUM_MUESTRA: 6,
    VARIEDAD: 7,
    GENETICA: 8,
    PESO_MUESTRA: 9,
    PP_BAYA: 10,
    N_BAYAS: 11,
    HERIDA_ABIERTA: 12,
    RUSSET: 13,
    DESHIDRATADO: 14,
    SIN_PRUINA: 15,
    DESGARRO: 16,
    EXUDACION: 17,
    R_FLORAL: 18,
    PEDUNCULO: 19,
    BRIX: 20,
    ACIDEZ: 21,
    OBSERVACIONES: 22,
    SESSION_ID: 23,
    FILA_VARIEDAD: 24,
    FILA_MUESTRA: 25,
    USUARIO: 26,
    DISPOSITIVO: 27,
    ORIGEN: 28,
    CODIGO_FORM: 29,
    REVISION_FORM: 30,
    SYNC_ESTADO: 31,
    OFFLINE_ID: 32,
    LAT: 33,
    LNG: 34,
    FONDO: 35,
    CUARTEL: 36,
    BLOQUE: 37,
    LOTE: 38,
    TURNO: 39,
    NOTAS_SYNC: 40,
    HASH_PAYLOAD: 41,
    APP_VERSION: 42,
    PESO_TOTAL_VAR: 43,
    N_FILAS_VAR: 44,
    TIMESTAMP_MS: 45,
    RESERVADO_46: 46,
  };

  /** Hoja2 — 9 columnas tiempos jarras */
  const COLS_JARRAS = {
    UID: 1,
    FECHA: 2,
    NUM_MUESTRA: 3,
    JARRA: 4,
    TIPO: 5,
    INICIO: 6,
    FIN: 7,
    TOTAL_MIN: 8,
    OBSERVACION: 9,
  };

  const DEFECTOS = [
    { key: 'herida_abierta', label: 'Herida abierta', col: COLS_REGISTRO.HERIDA_ABIERTA },
    { key: 'russet', label: 'Russet', col: COLS_REGISTRO.RUSSET },
    { key: 'deshidratado', label: 'Deshidratado', col: COLS_REGISTRO.DESHIDRATADO },
    { key: 'sin_pruina', label: 'Sin pruina', col: COLS_REGISTRO.SIN_PRUINA },
    { key: 'desgarro', label: 'Desgarro', col: COLS_REGISTRO.DESGARRO },
    { key: 'exudacion', label: 'Exudación', col: COLS_REGISTRO.EXUDACION },
    { key: 'r_floral', label: 'R. Floral', col: COLS_REGISTRO.R_FLORAL },
    { key: 'pedunculo', label: 'Pedúnculo', col: COLS_REGISTRO.PEDUNCULO },
  ];

  const FORM_META = {
    codigo: 'IN-ID-FO-001',
    revision: '00',
    titulo: 'Evaluaciones de Seguimiento de Cosecha - Arándano I+D',
    subtitulo: 'REGISTRO DE CALIDAD',
  };

  /** Campos del formulario papel (cuadros rojos) — únicos que guarda el usuario */
  const CAMPOS_FORMULARIO = {
    sesion: [
      { key: 'fecha_cosecha', label: 'Fecha cosecha' },
      { key: 't_ambiente', label: 'T° ambiente' },
      { key: 't_pulpa', label: 'T° pulpa' },
    ],
    variedad: [
      { key: 'variedad', label: 'Variedad' },
      { key: 'genetica', label: 'Genética' },
    ],
    fila: [
      { key: 'peso_muestra', field: 'peso', label: 'Peso muestras', ph: 'Peso' },
      { key: 'pp_baya', field: 'pp_baya', label: 'PP Baya', ph: 'PP' },
      { key: 'n_bayas', field: 'n_bayas', label: 'N° Bayas', ph: 'N°' },
      { key: 'brix', field: 'brix', label: '°Brix', ph: 'Brix' },
      { key: 'acidez', field: 'acidez', label: 'Acidez', ph: 'Acidez' },
      { key: 'observaciones', label: 'Observaciones' },
    ],
  };

  const FILA_PLACEHOLDERS = Object.fromEntries(
    CAMPOS_FORMULARIO.fila.filter((f) => f.field && f.ph).map((f) => [f.field, f.ph])
  );

  function getApiUrl() {
    const saved = localStorage.getItem(STORAGE_KEYS.CONFIG_URL);
    if (saved && saved.trim()) return saved.trim();
    if (APPS_SCRIPT_API_URL && APPS_SCRIPT_API_URL.trim()) return APPS_SCRIPT_API_URL.trim();
    return '';
  }

  function setApiUrl(url) {
    if (url && url.trim()) {
      localStorage.setItem(STORAGE_KEYS.CONFIG_URL, url.trim());
    } else {
      localStorage.removeItem(STORAGE_KEYS.CONFIG_URL);
    }
  }

  function generarUid() {
    const t = Date.now().toString(36);
    const r = Math.random().toString(36).slice(2, 10);
    return `uid_${t}_${r}`;
  }

  function generarSessionId() {
    return `ses_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function hashSimple(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(16);
  }

  global.MuestrasConfig = {
    APPS_SCRIPT_API_URL,
    APP_VERSION,
    BORRADOR_AUTOGUARDADO_MS,
    STORAGE_KEYS,
    JSONP_DEFAULT_TIMEOUT_MS,
    JSONP_REINTENTOS,
    JSONP_PAUSA_MS,
    POST_CONFIRMACION_PAUSA_1_MS,
    POST_CONFIRMACION_PAUSA_2_MS,
    COLS_REGISTRO,
    COLS_JARRAS,
    DEFECTOS,
    FORM_META,
    CAMPOS_FORMULARIO,
    FILA_PLACEHOLDERS,
    getApiUrl,
    setApiUrl,
    generarUid,
    generarSessionId,
    hashSimple,
  };
})(typeof window !== 'undefined' ? window : globalThis);
