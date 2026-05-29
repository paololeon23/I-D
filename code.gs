/**
 * Muestras Web — Google Apps Script
 * Web App: doGet (JSON/JSONP) + doPost (JSON escrituras)
 *
 * Hoja "Ev. Fisico-Quimico" — imagen 1 (Brix / Acidez por fila)
 * Hoja "Ev. Defectos"       — imagen 2 (peso, PP, N bayas + defectos)
 * Guarda solo NOMBRES de variedad y genética (nunca códigos/id).
 */

const SHEET_FISICO = 'Ev. Fisico-Quimico';
const SHEET_DEFECTOS = 'Ev. Defectos';
const SHEET_JARRAS = 'TD_S.C';

const MESES_CORTO = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

/** Columnas hoja físico-químico (como planilla del usuario) */
const HEADERS_FISICO = [
  'Fecha Cosecha',
  'Periodo',
  'Proyecto',
  'Variedad',
  'Solidos Solubles (°Brix)',
  'Acidez (%)',
  'uid',
  'session_id',
];

/** Columnas hoja defectos (como planilla del usuario) */
const HEADERS_DEFECTOS = [
  'Fecha Cosecha',
  'Fecha Evaluación',
  'Periodo',
  'Proyecto',
  'Variedad',
  'N.° Clamshells',
  'T° Ambiente',
  'T° Pulpa',
  'Tamaño de Muestra (gr)',
  'Peso Baya (gr)',
  'N bayas',
  'Herida abierta',
  'Russet',
  'Deshidratado',
  'Sin pruina',
  'Desgarro',
  'Exudación',
  'R. Floral',
  'Pedúnculo',
  'Observaciones',
  'uid',
  'session_id',
];

const HEADERS_JARRAS = [
  'uid', 'fecha', 'num_muestra', 'jarra', 'tipo', 'inicio', 'fin', 'total_min', 'observacion',
];

const COLS_FISICO = HEADERS_FISICO.length;
const COLS_DEFECTOS = HEADERS_DEFECTOS.length;
const COLS_JARRAS = HEADERS_JARRAS.length;

const UID_COL_FISICO = HEADERS_FISICO.indexOf('uid') + 1;
const UID_COL_DEFECTOS = HEADERS_DEFECTOS.indexOf('uid') + 1;

/** Confirmación rápida JSONP (igual patrón MTTP — sin escanear hoja) */
const UID_PROPS_PREFIX = 'id_cosecha_uid_';
const HASH_PROPS_PREFIX = 'id_cosecha_hash_';

function doGet(e) {
  const p = e && e.parameter ? e.parameter : {};
  const accion = (p.accion || '').toString();
  let result;

  try {
    var uidCheck = String(p.uid || '').trim();
    if (uidCheck && (String(p.existe_uid || '').trim() === '1' || accion === 'existe_uid')) {
      result = respuestaExisteUid_(uidCheck);
      return responderJson_(result, p.callback);
    }

    switch (accion) {
      case 'ping':
        result = { ok: true, ts: Date.now(), version: '2.2.0' };
        break;
      case 'existe_uid':
        result = respuestaExisteUid_(p.uid);
        break;
      case 'existe_num_muestra_global':
        result = { existe: false, nota: 'num_muestra_global_no_usado' };
        break;
      case 'ultimo_fisico_quimico':
        result = ultimoRegistroHoja_(SHEET_FISICO, HEADERS_FISICO);
        break;
      case 'ultimo_defectos':
        result = ultimoRegistroHoja_(SHEET_DEFECTOS, HEADERS_DEFECTOS);
        break;
      case 'listar_registros':
        result = listarRegistros_(p.desde, p.limite);
        break;
      default:
        result = { ok: false, error: 'accion_no_soportada', accion: accion };
    }
  } catch (err) {
    result = { ok: false, error: String(err) };
  }

  return responderJson_(result, p.callback);
}

function doPost(e) {
  function out(obj) {
    return ContentService.createTextOutput(JSON.stringify(obj))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (!e || !e.postData || !e.postData.contents) {
    return out({ ok: false, error: 'Sin datos POST' });
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return out({ ok: false, error: 'Servidor ocupado, reintenta' });
  }

  var result;
  try {
    var body = JSON.parse(String(e.postData.contents || ''));
    var accion = (body.accion || '').toString();
    switch (accion) {
      case 'registrar_cosecha':
        result = registrarCosecha_(body);
        break;
      case 'registrar_jarras':
        result = registrarJarras_(body);
        break;
      case 'registrar_packing':
        result = { ok: false, error: 'registrar_packing_no_implementado' };
        break;
      default:
        result = { ok: false, error: 'accion_no_soportada' };
    }
  } catch (err) {
    result = { ok: false, error: String(err) };
  } finally {
    try {
      lock.releaseLock();
    } catch (e2) { /* ignore */ }
  }

  return out(result);
}

function responderJson_(obj, callback) {
  const json = JSON.stringify(obj);
  if (callback) {
    const safeCb = String(callback).replace(/[^\w$.]/g, '');
    return ContentService.createTextOutput(safeCb + '(' + json + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function getSheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
  }
  return sh;
}

function ensureHeaders_(sh, headers) {
  const lastCol = headers.length;
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, lastCol).setValues([headers]);
    sh.getRange(1, 1, 1, lastCol).setFontWeight('bold');
    return;
  }
  const existing = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  const vacio = existing.every(function (c) { return c === '' || c == null; });
  if (vacio) {
    sh.getRange(1, 1, 1, lastCol).setValues([headers]);
    sh.getRange(1, 1, 1, lastCol).setFontWeight('bold');
  }
}

/** Solo nombre visible — nunca id/código del catálogo */
function nombreVariedad_(f) {
  return String(f.variedad || '').trim();
}

function nombreGenetica_(f) {
  return String(f.genetica || '').trim();
}

function parseFechaCosecha_(str) {
  if (!str) return new Date();
  const s = String(str).trim();

  const mTexto = s.match(/^(\d{1,2})[-/]([A-Za-zÁÉÍÓÚáéíóúñÑ]{3,})[-/](\d{2,4})$/);
  if (mTexto) {
    const day = parseInt(mTexto[1], 10);
    const mesTxt = mTexto[2].toLowerCase().slice(0, 3);
    const idx = MESES_CORTO.findIndex(function (m) { return m.toLowerCase().slice(0, 3) === mesTxt; });
    let year = parseInt(mTexto[3], 10);
    if (year < 100) year += 2000;
    if (idx >= 0) return new Date(year, idx, day);
  }

  const parts = s.split('-').map(function (x) { return parseInt(x, 10); });
  if (parts.length >= 3 && parts.every(function (n) { return Number.isFinite(n); })) {
    let year = parts[2];
    if (year < 100) year += 2000;
    return new Date(year, parts[1] - 1, parts[0]);
  }

  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function formatFechaSheet_(date) {
  const d = date instanceof Date ? date : parseFechaCosecha_(date);
  return d.getDate() + '-' + MESES_CORTO[d.getMonth()] + '-' + String(d.getFullYear()).slice(-2);
}

function periodoFromFecha_(fechaStr) {
  const d = parseFechaCosecha_(fechaStr);
  const y = d.getFullYear();
  if (d.getMonth() >= 6) return y + ' - ' + (y + 1);
  return (y - 1) + ' - ' + y;
}

function valNum_(v) {
  return v != null && v !== '' ? v : '';
}

function filaToFisicoRow_(f, fechaEvaluacion) {
  const fc = f.fecha_cosecha || '';
  return [
    formatFechaSheet_(fc),
    periodoFromFecha_(fc),
    nombreGenetica_(f),
    nombreVariedad_(f),
    valNum_(f.brix),
    valNum_(f.acidez),
    f.uid || '',
    f.session_id || '',
  ];
}

function filaToDefectosRow_(f, fechaEvaluacion) {
  const fc = f.fecha_cosecha || '';
  return [
    formatFechaSheet_(fc),
    formatFechaSheet_(fechaEvaluacion),
    periodoFromFecha_(fc),
    nombreGenetica_(f),
    nombreVariedad_(f),
    f.fila_muestra != null && f.fila_muestra !== '' ? f.fila_muestra : '',
    valNum_(f.t_ambiente),
    valNum_(f.t_pulpa),
    valNum_(f.peso_muestra),
    valNum_(f.pp_baya),
    valNum_(f.n_bayas),
    valNum_(f.herida_abierta),
    valNum_(f.russet),
    valNum_(f.deshidratado),
    valNum_(f.sin_pruina),
    valNum_(f.desgarro),
    valNum_(f.exudacion),
    valNum_(f.r_floral),
    valNum_(f.pedunculo),
    f.observaciones || '',
    f.uid || '',
    f.session_id || '',
  ];
}

function uidEnColumna_(sh, uidCol, uid) {
  if (!uid) return false;
  const u = String(uid);
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const cell = String(data[i][uidCol - 1] || '');
    if (cell === u) return true;
    if (cell.indexOf(u + '_r') === 0) return true;
  }
  const baseUid = u.split('_r')[0];
  for (let j = 1; j < data.length; j++) {
    const cell = String(data[j][uidCol - 1] || '');
    if (cell === baseUid || cell.indexOf(baseUid + '_r') === 0) return true;
  }
  return false;
}

function uidPropsKey_(uid) {
  return UID_PROPS_PREFIX + String(uid || '').trim();
}

function uidMarcadoEnProps_(uid) {
  if (!uid) return false;
  return PropertiesService.getScriptProperties().getProperty(uidPropsKey_(uid)) === '1';
}

function hashPropsKey_(hash) {
  return HASH_PROPS_PREFIX + String(hash || '').trim();
}

function hashMarcadoEnProps_(hash) {
  if (!hash) return false;
  return PropertiesService.getScriptProperties().getProperty(hashPropsKey_(hash)) === '1';
}

function marcarUidProcesado_(uid, hashPayload) {
  var props = PropertiesService.getScriptProperties();
  if (uid) props.setProperty(uidPropsKey_(uid), '1');
  if (hashPayload) props.setProperty(hashPropsKey_(hashPayload), '1');
  limpiarUidsAntiguosEnProps_();
}

function limpiarUidsAntiguosEnProps_() {
  try {
    var props = PropertiesService.getScriptProperties();
    var all = props.getProperties();
    var keys = [];
    for (var k in all) {
      if (String(k).indexOf(UID_PROPS_PREFIX) === 0 || String(k).indexOf(HASH_PROPS_PREFIX) === 0) {
        keys.push(k);
      }
    }
    if (keys.length <= 500) return;
    keys.sort();
    var eliminar = keys.length - 500;
    for (var i = 0; i < eliminar; i++) {
      props.deleteProperty(keys[i]);
    }
  } catch (e) { /* ignore */ }
}

/** Respuesta GET confirmación (ScriptProperties primero, hoja como respaldo) */
function respuestaExisteUid_(uid) {
  var u = String(uid || '').trim();
  if (!u) {
    return { ok: false, error: 'falta_uid', existe: false };
  }
  if (uidMarcadoEnProps_(u)) {
    return { ok: true, existe: true, uid: u, fuente: 'props' };
  }
  var hoja = existeUidEnHoja_(u);
  if (hoja.existe) {
    return { ok: true, existe: true, uid: u, fuente: 'hoja', hoja: hoja.hoja };
  }
  return { ok: true, existe: false, uid: u };
}

function existeUidEnHoja_(uid) {
  if (!uid) return { existe: false };
  var shF = getSheet_(SHEET_FISICO);
  var shD = getSheet_(SHEET_DEFECTOS);
  ensureHeaders_(shF, HEADERS_FISICO);
  ensureHeaders_(shD, HEADERS_DEFECTOS);
  if (uidEnColumna_(shF, UID_COL_FISICO, uid)) return { existe: true, hoja: SHEET_FISICO };
  if (uidEnColumna_(shD, UID_COL_DEFECTOS, uid)) return { existe: true, hoja: SHEET_DEFECTOS };
  return { existe: false };
}

function existeUid_(uid) {
  return respuestaExisteUid_(uid);
}

function ultimoRegistroHoja_(sheetName, headers) {
  const sh = getSheet_(sheetName);
  ensureHeaders_(sh, headers);
  const data = sh.getDataRange().getValues();
  if (data.length <= 1) {
    return { ok: true, hoja: sheetName, registro: null, fila: null };
  }

  const hdr = data[0];
  const last = data[data.length - 1];
  const registro = {};
  for (let i = 0; i < hdr.length; i++) {
    const key = String(hdr[i] || '').trim();
    if (!key) continue;
    registro[key] = last[i] !== '' && last[i] != null ? last[i] : '';
  }

  return {
    ok: true,
    hoja: sheetName,
    fila: data.length,
    registro: registro,
  };
}

function registrarCosecha_(body) {
  const uid = body.uid;
  if (!uid) return { ok: false, error: 'falta_uid' };

  if (uidMarcadoEnProps_(uid)) {
    return {
      ok: true,
      duplicado: true,
      mensaje: 'Registro ya procesado anteriormente (evitado duplicado)',
      uid: uid,
    };
  }

  var hashPayload = body.hash_payload ? String(body.hash_payload).trim() : '';
  if (hashPayload && hashMarcadoEnProps_(hashPayload)) {
    return {
      ok: true,
      duplicado: true,
      mensaje: 'Mismo contenido ya registrado (evitado duplicado)',
      uid: uid,
    };
  }

  const existe = existeUidEnHoja_(uid);
  if (existe.existe) {
    marcarUidProcesado_(uid);
    return { ok: true, duplicado: true, mensaje: 'UID ya registrado', hoja: existe.hoja };
  }

  const filas = body.filas;
  if (!filas || !filas.length) return { ok: false, error: 'sin_filas' };

  const filasValidas = filas.filter(function (f) {
    return f.peso_muestra != null && f.peso_muestra !== '';
  });
  if (!filasValidas.length) return { ok: false, error: 'sin_filas_con_peso' };

  const shFisico = getSheet_(SHEET_FISICO);
  const shDefectos = getSheet_(SHEET_DEFECTOS);
  ensureHeaders_(shFisico, HEADERS_FISICO);
  ensureHeaders_(shDefectos, HEADERS_DEFECTOS);

  const fechaEvaluacion = new Date();
  const rowsFisico = filasValidas.map(function (f) {
    return filaToFisicoRow_(f, fechaEvaluacion);
  });
  const rowsDefectos = filasValidas.map(function (f) {
    return filaToDefectosRow_(f, fechaEvaluacion);
  });

  const startF = shFisico.getLastRow() + 1;
  shFisico.getRange(startF, 1, rowsFisico.length, COLS_FISICO).setValues(rowsFisico);

  const startD = shDefectos.getLastRow() + 1;
  shDefectos.getRange(startD, 1, rowsDefectos.length, COLS_DEFECTOS).setValues(rowsDefectos);

  marcarUidProcesado_(uid, hashPayload);

  return {
    ok: true,
    uid: uid,
    message: 'Registro exitoso',
    filas_insertadas: filasValidas.length,
    received: filas.length,
    inserted: filasValidas.length,
    fisico: { hoja: SHEET_FISICO, fila_inicio: startF, filas: rowsFisico.length },
    defectos: { hoja: SHEET_DEFECTOS, fila_inicio: startD, filas: rowsDefectos.length },
  };
}

function registrarJarras_(body) {
  const filas = body.filas || [body];
  const sh = getSheet_(SHEET_JARRAS);
  ensureHeaders_(sh, HEADERS_JARRAS);
  const rows = filas.map(function (j) {
    return [
      j.uid || '',
      j.fecha || '',
      j.num_muestra || '',
      j.jarra || '',
      j.tipo || '',
      j.inicio || '',
      j.fin || '',
      j.total_min != null ? j.total_min : '',
      j.observacion || '',
    ];
  });
  const startRow = sh.getLastRow() + 1;
  sh.getRange(startRow, 1, rows.length, COLS_JARRAS).setValues(rows);
  return { ok: true, filas: rows.length, hoja: SHEET_JARRAS };
}

function listarRegistros_(desde, limite) {
  const sh = getSheet_(SHEET_FISICO);
  ensureHeaders_(sh, HEADERS_FISICO);
  const data = sh.getDataRange().getValues();
  if (data.length <= 1) return { ok: true, registros: [] };

  const hdr = data[0];
  const idx = function (name) {
    const i = hdr.indexOf(name);
    return i >= 0 ? i : -1;
  };

  const max = Math.min(parseInt(limite, 10) || 50, 200);
  const registros = [];
  for (let i = data.length - 1; i >= 1 && registros.length < max; i--) {
    const r = data[i];
    registros.push({
      uid: idx('uid') >= 0 ? r[idx('uid')] : '',
      fecha_cosecha: idx('Fecha Cosecha') >= 0 ? r[idx('Fecha Cosecha')] : '',
      periodo: idx('Periodo') >= 0 ? r[idx('Periodo')] : '',
      proyecto: idx('Proyecto') >= 0 ? r[idx('Proyecto')] : '',
      variedad: idx('Variedad') >= 0 ? r[idx('Variedad')] : '',
      brix: idx('Solidos Solubles (°Brix)') >= 0 ? r[idx('Solidos Solubles (°Brix)')] : '',
      acidez: idx('Acidez (%)') >= 0 ? r[idx('Acidez (%)')] : '',
      session_id: idx('session_id') >= 0 ? r[idx('session_id')] : '',
    });
  }
  return { ok: true, registros: registros, hoja: SHEET_FISICO };
}

/** Ejecutar una vez desde el editor para crear encabezados */
function setupSheets() {
  ensureHeaders_(getSheet_(SHEET_FISICO), HEADERS_FISICO);
  ensureHeaders_(getSheet_(SHEET_DEFECTOS), HEADERS_DEFECTOS);
  ensureHeaders_(getSheet_(SHEET_JARRAS), HEADERS_JARRAS);
  Logger.log('Hojas listas: ' + SHEET_FISICO + ', ' + SHEET_DEFECTOS + ', ' + SHEET_JARRAS);
}
