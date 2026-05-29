/**
 * Muestras Web — Capa de red (patrón MTTP)
 * POST no-cors + application/json → Apps Script
 * Confirmación JSONP por UID (ScriptProperties en servidor)
 * Cola offline solo sin internet
 */
(function (global) {
  'use strict';

  const C = global.MuestrasConfig;

  function esperar(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function callbackJsonp(urlBase, params, timeoutMs) {
    const timeout = timeoutMs ?? C.JSONP_DEFAULT_TIMEOUT_MS;
    return new Promise((resolve, reject) => {
      if (!urlBase) {
        reject(new Error('URL de Apps Script no configurada'));
        return;
      }
      const cbName = `__cb_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const qs = new URLSearchParams(params || {});
      qs.set('callback', cbName);
      qs.set('_ts', String(Date.now()));

      const script = document.createElement('script');
      let done = false;

      const cleanup = () => {
        if (script.parentNode) script.parentNode.removeChild(script);
        try {
          delete global[cbName];
        } catch (_) {
          global[cbName] = undefined;
        }
      };

      const finish = (fn, val) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        cleanup();
        fn(val);
      };

      const timer = setTimeout(() => {
        finish(reject, new Error('JSONP timeout'));
      }, timeout);

      global[cbName] = (payload) => {
        finish(resolve, payload);
      };

      script.onerror = () => finish(reject, new Error('JSONP error de red'));
      script.src = `${urlBase}${urlBase.includes('?') ? '&' : '?'}${qs.toString()}`;
      document.head.appendChild(script);
    });
  }

  async function jsonpAccion(accion, extraParams, opts) {
    const o = opts || {};
    const max = o.reintentos != null ? o.reintentos : C.JSONP_REINTENTOS;
    const timeout = o.timeoutMs ?? C.JSONP_DEFAULT_TIMEOUT_MS;
    const url = C.getApiUrl();
    const params = { accion, ...extraParams };
    let lastErr;
    for (let i = 0; i < max; i++) {
      try {
        return await callbackJsonp(url, params, timeout);
      } catch (e) {
        lastErr = e;
        if (i < max - 1 && C.JSONP_PAUSA_MS > 0) await esperar(C.JSONP_PAUSA_MS);
      }
    }
    throw lastErr;
  }

  /** Igual que MTTP: POST no-cors + JSON (Apps Script lee e.postData.contents) */
  async function enviarPostNoCors(payload) {
    const url = C.getApiUrl();
    if (!url) throw new Error('URL de Apps Script no configurada');
    const body = JSON.stringify(payload);
    console.info('[Muestras POST]', { uid: payload.uid, filas: payload.filas?.length });
    await fetch(url, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    return { enviado: true };
  }

  async function existeUidServidor(uid) {
    if (!uid) return null;
    try {
      const res = await jsonpAccion(
        'existe_uid',
        { uid: String(uid), existe_uid: '1' },
        { reintentos: 1, timeoutMs: C.JSONP_DEFAULT_TIMEOUT_MS }
      );
      if (!res) return null;
      return !!(res.existe);
    } catch (_) {
      return null;
    }
  }

  /**
   * Confirmación MTTP: UID en ScriptProperties (3 lecturas espaciadas, sin bucle infinito)
   */
  async function confirmarRegistroServidor(uid) {
    if (!uid) return { estado: 'pendiente' };

    if ((await existeUidServidor(uid)) === true) {
      return { estado: 'confirmado' };
    }

    await esperar(C.POST_CONFIRMACION_PAUSA_1_MS || 900);
    if ((await existeUidServidor(uid)) === true) {
      return { estado: 'confirmado' };
    }

    await esperar(C.POST_CONFIRMACION_PAUSA_2_MS || 1400);
    if ((await existeUidServidor(uid)) === true) {
      return { estado: 'confirmado' };
    }

    return { estado: 'pendiente' };
  }

  async function existeUid(uid, opts) {
    const v = await existeUidServidor(uid);
    return v === true;
  }

  async function existeNumMuestraGlobal(numMuestra) {
    const res = await jsonpAccion('existe_num_muestra_global', {
      num_muestra: String(numMuestra),
    });
    return !!(res && res.existe);
  }

  async function pingServidor() {
    try {
      const res = await jsonpAccion('ping', {}, { timeoutMs: 5000, reintentos: 1 });
      return !!(res && res.ok);
    } catch (_) {
      return false;
    }
  }

  class ColaOffline {
    constructor() {
      this.key = C.STORAGE_KEYS.COLA_OFFLINE;
    }

    _leer() {
      try {
        const raw = localStorage.getItem(this.key);
        return raw ? JSON.parse(raw) : [];
      } catch (_) {
        return [];
      }
    }

    _guardar(items) {
      localStorage.setItem(this.key, JSON.stringify(items));
      global.dispatchEvent(new CustomEvent('cola-offline-change', { detail: { count: items.length } }));
    }

    contar() {
      return this._leer().length;
    }

    agregar(item) {
      const items = this._leer();
      const uid = item?.uid;
      const hash = item?.hash_payload;
      if (uid && items.some((x) => x.payload?.uid === uid)) return null;
      if (hash && items.some((x) => x.payload?.hash_payload === hash)) return null;
      const entry = {
        id: `off_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        creado: new Date().toISOString(),
        payload: item,
      };
      items.push(entry);
      this._guardar(items);
      return entry.id;
    }

    listar() {
      return this._leer();
    }

    quitar(id) {
      const items = this._leer().filter((x) => x.id !== id);
      this._guardar(items);
    }

    quitarPorUid(uid) {
      if (!uid) return;
      const base = String(uid).split('_r')[0];
      const items = this._leer().filter((x) => {
        const pUid = x.payload?.uid;
        if (!pUid) return true;
        const p = String(pUid);
        return p !== uid && p !== base && !p.startsWith(base + '_r');
      });
      this._guardar(items);
    }
  }

  const colaOffline = new ColaOffline();
  let procesandoCola = false;
  /** UIDs con POST en curso (evita doble envío paralelo) */
  const enviosActivos = new Set();

  function quitarColaPorPayload(payload) {
    const uid = payload?.uid;
    const hash = payload?.hash_payload;
    const items = colaOffline.listar();
    items.forEach((entry) => {
      const p = entry.payload;
      if (!p) return;
      if (uid && p.uid === uid) colaOffline.quitar(entry.id);
      else if (hash && p.hash_payload === hash) colaOffline.quitar(entry.id);
    });
  }

  async function enviarYConfirmar(payload) {
    const uid = String(payload?.uid || '').trim();
    if (!uid) throw new Error('Falta UID en payload');

    if (enviosActivos.has(uid)) {
      return {
        ok: true,
        confirmado: true,
        duplicado_uid: true,
        mensaje: 'Este registro ya se está enviando o ya fue guardado.',
      };
    }

    enviosActivos.add(uid);
    try {
      quitarColaPorPayload(payload);
      await enviarPostNoCors(payload);
      const confirmacion = await confirmarRegistroServidor(uid);

      if (confirmacion.estado === 'confirmado') {
        colaOffline.quitarPorUid(uid);
        return { ok: true, confirmado: true, mensaje: 'Registro guardado en la planilla' };
      }

      return {
        ok: false,
        confirmado: false,
        mensaje:
          'El envío no se confirmó en el servidor. Verifique internet y la URL /exec del Web App.',
      };
    } finally {
      enviosActivos.delete(uid);
    }
  }

  async function procesarItemCola(entry) {
    const r = await enviarYConfirmar(entry.payload);
    if (r.confirmado) {
      colaOffline.quitar(entry.id);
    }
    return r;
  }

  async function procesarColaPendientes() {
    if (procesandoCola) return { omitido: true };
    if (!navigator.onLine) return { offline: true };
    if (!C.getApiUrl()) return { sinUrl: true };

    procesandoCola = true;
    const resultados = [];
    try {
      for (const entry of colaOffline.listar()) {
        const pUid = entry.payload?.uid;
        if (pUid && enviosActivos.has(pUid)) continue;
        try {
          const r = await procesarItemCola(entry);
          resultados.push({ id: entry.id, ...r });
        } catch (e) {
          resultados.push({ id: entry.id, ok: false, error: e.message });
        }
      }
    } finally {
      procesandoCola = false;
    }
    return { resultados, pendientes: colaOffline.contar() };
  }

  async function enviarRegistroConConfirmacion(payload, opciones) {
    const opts = opciones || {};
    const uid = payload.uid;

    if (!uid) throw new Error('Falta UID en payload');
    if (!C.getApiUrl()) throw new Error('Configure la URL del Web App de Apps Script');

    if (opts.validarNumMuestra !== false && payload.num_muestra != null && payload.num_muestra !== '') {
      const dup = await existeNumMuestraGlobal(payload.num_muestra);
      if (dup) {
        return { ok: false, duplicado_num_muestra: true, mensaje: `N° muestra ${payload.num_muestra} ya existe` };
      }
    }

    if (enviosActivos.has(uid)) {
      return {
        ok: true,
        confirmado: true,
        duplicado_uid: true,
        mensaje: 'Envío en curso. Espere un momento.',
      };
    }

    if (!navigator.onLine) {
      colaOffline.agregar(payload);
      return { ok: true, en_cola: true, mensaje: 'Sin internet — guardado en cola. Se enviará al reconectar.' };
    }

    try {
      const r = await enviarYConfirmar(payload);
      if (r.confirmado || r.duplicado_uid) {
        colaOffline.quitarPorUid(uid);
      }
      return r;
    } catch (e) {
      const yaEnCola = colaOffline.listar().some((x) => x.payload?.uid === uid);
      if (!yaEnCola) colaOffline.agregar(payload);
      return { ok: true, en_cola: true, mensaje: 'Error de red — guardado en cola. Se enviará al reconectar.' };
    }
  }

  async function listarHistorial(desde, limite) {
    return jsonpAccion(
      'listar_registros',
      { desde: desde || '', limite: String(limite || 50) },
      { reintentos: 2, timeoutMs: 8000 }
    );
  }

  global.MuestrasNetwork = {
    callbackJsonp,
    jsonpAccion,
    enviarPost: enviarPostNoCors,
    enviarPostNoCors,
    existeUid,
    existeUidServidor,
    confirmarRegistroServidor,
    existeNumMuestraGlobal,
    pingServidor,
    ColaOffline,
    colaOffline,
    procesarColaPendientes,
    enviarRegistroConConfirmacion,
    listarHistorial,
    esperar,
  };
})(typeof window !== 'undefined' ? window : globalThis);
