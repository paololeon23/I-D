/**
 * Muestras Web — App principal (Campo / Evaluación Cosecha)
 */
(function () {
  'use strict';

  const C = window.MuestrasConfig;
  const N = window.MuestrasNetwork;

  let variedades = [];
  let sessionId = C.generarSessionId();
  /** Un UID por intento de envío (evita duplicar filas si hay doble clic) */
  let envioUidActivo = null;
  let envioRegistroEnCurso = false;
  /** Siempre día actual — registro diario, no se adelanta ni atrasa */
  let fechaCosecha = '';
  let horaCallback = null;
  let borradorTimer = null;
  let restaurandoBorrador = false;
  let catalogos = { variedades: [], geneticas: [] };

  const $ = (sel, ctx) => (ctx || document).querySelector(sel);
  const $$ = (sel, ctx) => Array.from((ctx || document).querySelectorAll(sel));

  function initLucide() {
    if (window.lucide && typeof lucide.createIcons === 'function') {
      lucide.createIcons();
    }
  }

  /** Formato registro: d-m-y (ej. 28-5-26) */
  function formatFechaCosecha(date) {
    const d = date || new Date();
    return `${d.getDate()}-${d.getMonth() + 1}-${String(d.getFullYear()).slice(-2)}`;
  }

  function parseFechaCosecha(str) {
    if (!str || !String(str).trim()) return new Date();
    const parts = String(str).trim().split('-').map((x) => parseInt(x, 10));
    if (parts.length >= 3 && parts.every((n) => Number.isFinite(n))) {
      const year = parts[2] < 100 ? 2000 + parts[2] : parts[2];
      return new Date(year, parts[1] - 1, parts[0]);
    }
    return new Date();
  }

  function fechaHoy() {
    return formatFechaCosecha(new Date());
  }

  /** Siempre la fecha del día (no editable, no se restaura del borrador) */
  function obtenerFechaCosecha() {
    return fechaHoy();
  }

  function sincronizarFechaHoyVisual() {
    fechaCosecha = fechaHoy();
    const inp = $('#fecha-cosecha');
    if (inp) inp.value = fechaCosecha;
    actualizarFechaFab();
    actualizarHeaderContext();
  }

  function setFechaCosecha() {
    sincronizarFechaHoyVisual();
  }

  /** Mensaje tooltip según avance del mes de la fecha de cosecha */
  function textoProgresoMes(date) {
    const d = date || parseFechaCosecha(obtenerFechaCosecha());
    const meses = [
      'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
      'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
    ];
    const mes = meses[d.getMonth()];
    const day = d.getDate();
    const diasMes = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const restantes = diasMes - day;
    const pct = Math.round((day / diasMes) * 100);

    if (restantes === 0) return `¡Hoy termina el mes de ${mes}!`;
    if (restantes === 1) return `¡Mañana termina el mes de ${mes}!`;
    if (pct >= 85) return `¡Ya se termina el mes de ${mes}! · faltan ${restantes} días`;
    if (pct >= 60) return `Va avanzando ${mes} · ${pct}% del mes (${restantes} días restantes)`;
    if (pct >= 30) return `${mes} en curso · día ${day} de ${diasMes}`;
    return `${mes} recién comenzó · día ${day} de ${diasMes}`;
  }

  /** Formato FAB: "28" + "MAY 2026" */
  function formatFechaFab(date) {
    const d = date || parseFechaCosecha(obtenerFechaCosecha());
    const meses = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
    const day = String(d.getDate());
    const mesAnio = `${meses[d.getMonth()]} ${d.getFullYear()}`;
    return { day, mesAnio, completa: `${day} ${mesAnio}` };
  }

  function actualizarFechaFab() {
    const d = parseFechaCosecha(obtenerFechaCosecha());
    const f = formatFechaFab(d);
    const diasMes = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const pct = Math.round((d.getDate() / diasMes) * 100);

    const dayEl = $('#fecha-ring-day');
    const monthEl = $('#fecha-ring-month');
    const ring = $('#fecha-ring-widget');
    const tooltip = $('#fecha-ring-tooltip');
    const msg = textoProgresoMes(d);
    if (dayEl) dayEl.textContent = f.day;
    if (monthEl) monthEl.textContent = f.mesAnio;
    if (ring) {
      ring.style.setProperty('--ring-pct', `${pct}%`);
    }
    if (tooltip) tooltip.textContent = msg;
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function parseNum(val) {
    if (val === '' || val == null) return null;
    const n = parseFloat(String(val).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }

  function actualizarHeaderContext() {
    const ta = $('#t-ambiente')?.value?.trim();
    const tp = $('#t-pulpa')?.value?.trim();
    const tAmbTxt = ta ? `${ta}°` : '—';
    const tPulTxt = tp ? `${tp}°` : '—';
    const varTxt = String(variedades.length);

    const pillT = $('#pill-t-ambiente');
    const pillTp = $('#pill-t-pulpa');
    const pillVar = $('#pill-variedades');
    if (pillT) {
      pillT.textContent = tAmbTxt;
      pillT.closest('.context-stat')?.classList.toggle('has-value', !!ta);
    }
    if (pillTp) {
      pillTp.textContent = tPulTxt;
      pillTp.closest('.context-stat')?.classList.toggle('has-value', !!tp);
    }
    if (pillVar) {
      pillVar.textContent = varTxt;
      pillVar.closest('.context-stat')?.classList.toggle('has-value', variedades.length > 0);
    }

    const preview = $('#header-context-preview');
    if (preview) {
      const resumen = [];
      if (ta) resumen.push(`Amb ${ta}°`);
      if (tp) resumen.push(`Pul ${tp}°`);
      resumen.push(`${variedades.length} var.`);
      preview.textContent = resumen.join(' · ');
    }

    actualizarFechaFab();
  }

  function setContextAccordionOpen(open) {
    const acc = $('#context-accordion');
    const btn = $('#context-accordion-trigger');
    if (!acc || !btn) return;
    acc.classList.toggle('is-open', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    try {
      sessionStorage.setItem('muestras_context_accordion_open', String(open));
    } catch (_) {}
  }

  function initContextAccordion() {
    const acc = $('#context-accordion');
    const btn = $('#context-accordion-trigger');
    if (!acc || !btn) return;

    try {
      const saved = sessionStorage.getItem('muestras_context_accordion_open');
      if (saved === 'true') setContextAccordionOpen(true);
      else setContextAccordionOpen(false);
    } catch (_) {
      setContextAccordionOpen(false);
    }

    btn.addEventListener('click', () => {
      setContextAccordionOpen(!acc.classList.contains('is-open'));
    });
  }

  function borradorTieneDatos(data) {
    if (!data) return false;
    if (data.tAmbiente || data.tPulpa) return true;
    if (!data.variedades || !data.variedades.length) return false;
    return data.variedades.some((v) => {
      if (v.variedad?.trim() || v.genetica?.trim()) return true;
      return (v.muestras || []).some((m) => {
        return [m.peso, m.n_bayas, m.brix, m.acidez, m.observaciones].some((x) => x != null && String(x).trim() !== '');
      });
    });
  }

  function leerBorradorRaw() {
    try {
      const raw = localStorage.getItem(C.STORAGE_KEYS.BORRADOR);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function aplicarBorrador(data) {
    if (!data) return;
    restaurandoBorrador = true;
    if (data.sessionId) sessionId = data.sessionId;
    sincronizarFechaHoyVisual();
    if (data.tAmbiente != null) $('#t-ambiente').value = data.tAmbiente;
    if (data.tPulpa != null) $('#t-pulpa').value = data.tPulpa;
    if (data.variedades && data.variedades.length) {
      variedades = data.variedades;
      variedades.forEach(resolverMetaVariedad);
    }
    renderVariedades();
    restaurandoBorrador = false;
  }

  function programarAutoguardadoBorrador() {
    if (restaurandoBorrador) return;
    clearTimeout(borradorTimer);
    borradorTimer = setTimeout(() => guardarBorrador(true), C.BORRADOR_AUTOGUARDADO_MS);
  }

  /**
   * Guarda en localStorage del teléfono. Sobrevive cerrar pestaña/PWA.
   * Solo se elimina al enviar con éxito o al pulsar "Descartar borrador".
   */
  function guardarBorrador(silencioso) {
    syncFromDom();
    preservarEstadoAcordeonVariedades();
    const data = {
      sessionId,
      fechaCosecha: obtenerFechaCosecha(),
      tAmbiente: $('#t-ambiente')?.value ?? '',
      tPulpa: $('#t-pulpa')?.value ?? '',
      variedades,
      guardado: new Date().toISOString(),
    };

    if (!borradorTieneDatos(data)) {
      localStorage.removeItem(C.STORAGE_KEYS.BORRADOR);
      if (!silencioso) {
        Swal.fire({
          icon: 'info',
          title: 'Nada que guardar',
          text: 'Complete al menos un campo para generar borrador.',
        });
      }
      return;
    }

    localStorage.setItem(C.STORAGE_KEYS.BORRADOR, JSON.stringify(data));
    if (!silencioso) {
      Swal.fire({
        icon: 'success',
        title: 'Borrador guardado',
        html: 'Queda en este dispositivo aunque cierre la app.<br><small>Solo se borra al enviar o al descartar.</small>',
        timer: 2200,
        showConfirmButton: false,
      });
    }
  }

  async function descartarBorrador() {
    const data = leerBorradorRaw();
    if (!borradorTieneDatos(data)) {
      Swal.fire({ icon: 'info', title: 'No hay borrador', timer: 1200, showConfirmButton: false });
      return;
    }
    const r = await Swal.fire({
      title: '¿Descartar borrador?',
      html: 'Se eliminarán los datos <strong>no enviados</strong> guardados en este teléfono.<br>Esta acción no se puede deshacer.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, descartar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc3545',
    });
    if (!r.isConfirmed) return;
    localStorage.removeItem(C.STORAGE_KEYS.BORRADOR);
    limpiarFormulario(false);
    Swal.fire({ icon: 'success', title: 'Borrador eliminado', timer: 1500, showConfirmButton: false });
  }

  function restaurarBorradorAlInicio() {
    const data = leerBorradorRaw();
    if (!borradorTieneDatos(data)) return false;
    aplicarBorrador(data);
    return true;
  }

  function actualizarPendientes() {
    const n = N.colaOffline.contar();
    const el = $('#pendientes-count');
    if (el) el.textContent = pad2(n);
  }

  async function actualizarEstadoRed() {
    const online = navigator.onLine;
    const dot = $('#online-dot');
    const txt = $('#estado-linea');
    let servidorOk = null;

    if (dot) dot.classList.toggle('offline', !online);
    if (txt) txt.textContent = online ? 'En línea' : 'Sin conexión';

    if (online && C.getApiUrl()) {
      servidorOk = await N.pingServidor();
      if (!servidorOk && txt) txt.textContent = 'Servidor no responde';
    }

    actualizarPendientes();
  }

  function crearMuestraVacia() {
    return {
      id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      peso: '',
      n_bayas: '',
      pp_baya: '',
      herida_abierta: '',
      russet: '',
      deshidratado: '',
      sin_pruina: '',
      desgarro: '',
      exudacion: '',
      r_floral: '',
      pedunculo: '',
      brix: '',
      acidez: '',
      observaciones: '',
    };
  }

  function crearVariedadVacia(abierta) {
    return {
      id: `v_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      variedad: '',
      variedad_id: '',
      genetica: '',
      genetica_id: '',
      muestras: [crearMuestraVacia()],
      abierta: abierta === true,
    };
  }

  function preservarEstadoAcordeonVariedades() {
    variedades.forEach((v) => {
      const wrap = document.querySelector(`.variedad-wrap[data-variedad-id="${v.id}"]`);
      if (wrap) v.abierta = wrap.classList.contains('is-open');
    });
  }

  function filasLabel(v) {
    const n = v.muestras.length;
    return `${n} fila${n !== 1 ? 's' : ''}`;
  }

  function encabezadoVariedadWrap(v) {
    const gen = v.genetica.trim() || 'Genética';
    return {
      titulo: v.variedad.trim() || 'Variedad',
      subtitulo: `${gen} · ${filasLabel(v)}`,
    };
  }

  function actualizarEncabezadoVariedadWrap(wrap, v) {
    if (!wrap || !v) return;
    const h = encabezadoVariedadWrap(v);
    const title = wrap.querySelector('.variedad-wrap-title');
    const sub = wrap.querySelector('.variedad-wrap-sub');
    if (title) {
      title.textContent = h.titulo;
      title.classList.toggle('is-placeholder', !v.variedad.trim());
    }
    if (sub) {
      sub.textContent = h.subtitulo;
      sub.classList.toggle('is-placeholder', !v.genetica.trim());
    }
  }

  function contarDefectos(m) {
    return C.DEFECTOS.filter((d) => {
      const val = parseNum(m[d.key]);
      return val != null && val > 0;
    }).length;
  }

  function renderMuestraRow(variedad, muestra, idx) {
    const nDef = contarDefectos(muestra);
    const hasObs = !!(muestra.observaciones && String(muestra.observaciones).trim());

    return `
    <div class="fila-muestra" data-muestra-id="${muestra.id}">
      <span class="fila-num-badge" aria-label="Fila ${idx + 1}">${idx + 1}</span>
      <div class="fila-muestra-campos">
        <div class="fila-muestra-linea">
          <input type="number" inputmode="decimal" step="0.1" min="0" class="fila-inp"
            data-variedad="${variedad.id}" data-muestra="${muestra.id}" data-field="peso"
            value="${muestra.peso}" placeholder="${C.FILA_PLACEHOLDERS.peso}" aria-label="Peso muestras" />
          <input type="number" inputmode="decimal" step="0.01" min="0" class="fila-inp"
            data-variedad="${variedad.id}" data-muestra="${muestra.id}" data-field="pp_baya"
            value="${muestra.pp_baya}" placeholder="${C.FILA_PLACEHOLDERS.pp_baya}" aria-label="PP Baya" />
          <input type="number" inputmode="numeric" min="0" class="fila-inp"
            data-variedad="${variedad.id}" data-muestra="${muestra.id}" data-field="n_bayas"
            value="${muestra.n_bayas}" placeholder="${C.FILA_PLACEHOLDERS.n_bayas}" aria-label="N° bayas" />
          <button type="button" class="fila-btn-icon defectos-toggle" aria-expanded="false"
            aria-label="Defectos${nDef ? ` (${nDef})` : ''}"
            data-variedad="${variedad.id}" data-muestra="${muestra.id}">
            <i data-lucide="triangle-alert"></i>
            ${nDef ? `<span class="fila-btn-badge">${nDef}</span>` : ''}
          </button>
        </div>
        <div class="fila-muestra-linea">
          <input type="number" inputmode="decimal" step="0.1" class="fila-inp"
            data-variedad="${variedad.id}" data-muestra="${muestra.id}" data-field="brix"
            value="${muestra.brix}" placeholder="${C.FILA_PLACEHOLDERS.brix}" aria-label="°Brix" />
          <input type="number" inputmode="decimal" step="0.01" class="fila-inp"
            data-variedad="${variedad.id}" data-muestra="${muestra.id}" data-field="acidez"
            value="${muestra.acidez}" placeholder="${C.FILA_PLACEHOLDERS.acidez}" aria-label="Acidez" />
          <button type="button" class="fila-btn-icon obs-toggle"
            aria-label="Observaciones${hasObs ? ' (con texto)' : ''}"
            data-variedad="${variedad.id}" data-muestra="${muestra.id}">
            <i data-lucide="message-square"></i>
            ${hasObs ? '<span class="fila-btn-badge fila-btn-badge--dot" aria-hidden="true"></span>' : ''}
          </button>
        </div>
      </div>
      <div class="fila-muestra-acc">
        <span class="fila-acc-label">Acc.</span>
        <button type="button" class="btn-fila-acc btn-fila-add btn-agregar-muestra-despues"
          data-variedad="${variedad.id}" data-muestra="${muestra.id}" aria-label="Agregar fila">
          <i data-lucide="plus"></i>
        </button>
        ${idx > 0 ? `<button type="button" class="btn-fila-acc btn-fila-del btn-quitar-muestra"
          data-variedad="${variedad.id}" data-muestra="${muestra.id}" aria-label="Quitar fila">
          <i data-lucide="trash-2"></i>
        </button>` : ''}
      </div>
    </div>`;
  }

  function escapeHtml(s) {
    if (!s) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');
  }

  function renderVariedades() {
    const container = $('#variedades-container');
    if (!container) return;

    preservarEstadoAcordeonVariedades();

    container.innerHTML = variedades
      .map((v, vi) => {
        const open = !!v.abierta;
        const enc = encabezadoVariedadWrap(v);
        const muestrasHtml = v.muestras.map((m, mi) => renderMuestraRow(v, m, mi)).join('');
        const deleteVariedadBtn =
          vi > 0
            ? `<button type="button" class="variedad-wrap-delete btn-quitar-variedad" data-variedad="${v.id}" aria-label="Eliminar bloque de variedad">
              <i data-lucide="trash-2"></i>
            </button>`
            : '';
        return `
        <div class="variedad-wrap${open ? ' is-open' : ''}" data-variedad-id="${v.id}">
          <div class="variedad-wrap-head">
            <button type="button" class="variedad-wrap-trigger" data-variedad="${v.id}" aria-expanded="${open}">
              <span class="variedad-wrap-accent" aria-hidden="true"></span>
              <span class="variedad-wrap-text">
                <strong class="variedad-wrap-title${v.variedad.trim() ? '' : ' is-placeholder'}">${escapeHtml(enc.titulo)}</strong>
                <span class="variedad-wrap-sub${v.genetica.trim() ? '' : ' is-placeholder'}">${escapeHtml(enc.subtitulo)}</span>
              </span>
              <span class="variedad-wrap-status" aria-hidden="true">
                <i data-lucide="chevron-down"></i>
              </span>
            </button>
            ${deleteVariedadBtn}
          </div>
          <div class="variedad-wrap-panel" id="panel-${v.id}">
            <div class="variedad-wrap-panel-inner">
              <div class="variedad-tabla-card">
                <div class="variedad-meta-grid">
                  <div class="field field-select">
                    <label>Variedad</label>
                    <div class="select-wrap">
                      <select data-variedad-meta="${v.id}" data-meta="variedad" aria-label="Variedad"
                        class="${v.variedad_id ? '' : 'is-empty'}">
                        ${renderCatalogoSelectOptions('variedad', v.variedad_id)}
                      </select>
                      <i data-lucide="chevron-down"></i>
                    </div>
                  </div>
                  <div class="field field-select">
                    <label>Genética</label>
                    <div class="select-wrap">
                      <select data-variedad-meta="${v.id}" data-meta="genetica" aria-label="Genética"
                        class="${v.genetica_id ? '' : 'is-empty'}">
                        ${renderCatalogoSelectOptions('genetica', v.genetica_id)}
                      </select>
                      <i data-lucide="chevron-down"></i>
                    </div>
                  </div>
                </div>
                <div class="filas-muestra-list">
                  ${muestrasHtml}
                </div>
              </div>
            </div>
          </div>
        </div>`;
      })
      .join('');

    bindVariedadEvents();
    initLucide();
    actualizarHeaderContext();
    actualizarGuiaPasos();
  }

  function syncFromDom() {
    variedades.forEach((v) => {
      const metaV = $(`[data-variedad-meta="${v.id}"][data-meta="variedad"]`);
      const metaG = $(`[data-variedad-meta="${v.id}"][data-meta="genetica"]`);
      if (metaV) {
        v.variedad_id = metaV.value || '';
        const itemV = itemCatalogoPorId('variedad', v.variedad_id);
        v.variedad = itemV ? itemV.nombre : '';
        metaV.classList.toggle('is-empty', !v.variedad_id);
      }
      if (metaG) {
        v.genetica_id = metaG.value || '';
        const itemG = itemCatalogoPorId('genetica', v.genetica_id);
        v.genetica = itemG ? itemG.nombre : '';
        metaG.classList.toggle('is-empty', !v.genetica_id);
      }

      v.muestras.forEach((m) => {
        $$(`[data-variedad="${v.id}"][data-muestra="${m.id}"][data-field]`).forEach((inp) => {
          m[inp.dataset.field] = inp.value;
        });
      });
    });
  }

  function normalizarBusqueda(s) {
    return String(s || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  function listaCatalogo(meta) {
    return meta === 'genetica' ? catalogos.geneticas : catalogos.variedades;
  }

  function catalogoItemId(item) {
    return String(item?.id ?? item?.codigo ?? '');
  }

  function normalizarCatalogoItem(item) {
    return {
      id: catalogoItemId(item),
      nombre: String(item?.nombre ?? '').trim(),
    };
  }

  function itemCatalogoPorId(meta, id) {
    const sid = String(id || '').trim();
    if (!sid) return null;
    return listaCatalogo(meta).find((item) => catalogoItemId(item) === sid) || null;
  }

  function resolverMetaVariedad(v) {
    if (v.variedad_id) {
      const item = itemCatalogoPorId('variedad', v.variedad_id);
      if (item) {
        v.variedad = item.nombre;
        v.variedad_id = catalogoItemId(item);
      }
    } else if (v.variedad?.trim()) {
      const item = itemCatalogoExacto('variedad', v.variedad);
      if (item) {
        v.variedad = item.nombre;
        v.variedad_id = catalogoItemId(item);
      }
    }
    if (v.genetica_id) {
      const item = itemCatalogoPorId('genetica', v.genetica_id);
      if (item) {
        v.genetica = item.nombre;
        v.genetica_id = catalogoItemId(item);
      }
    } else if (v.genetica?.trim()) {
      const item = itemCatalogoExacto('genetica', v.genetica);
      if (item) {
        v.genetica = item.nombre;
        v.genetica_id = catalogoItemId(item);
      }
    }
  }

  function renderCatalogoSelectOptions(meta, selectedId) {
    const lista = listaCatalogo(meta);
    const placeholder = meta === 'genetica' ? 'Genética' : 'Variedad';
    const sid = String(selectedId || '').trim();
    let html = `<option value="" disabled${sid ? '' : ' selected'} hidden>${placeholder}</option>`;
    lista.forEach((item) => {
      const id = catalogoItemId(item);
      html += `<option value="${escapeHtml(id)}"${id === sid ? ' selected' : ''}>${escapeHtml(item.nombre)}</option>`;
    });
    return html;
  }

  function itemCatalogoExacto(meta, valor) {
    const v = String(valor || '').trim();
    if (!v) return null;
    const nv = normalizarBusqueda(v);
    return (
      listaCatalogo(meta).find((item) => {
        const itemId = catalogoItemId(item);
        return (
          normalizarBusqueda(item.nombre) === nv ||
          itemId === v ||
          `${itemId} · ${item.nombre}`.toLowerCase() === v.toLowerCase() ||
          normalizarBusqueda(`${itemId} · ${item.nombre}`) === nv
        );
      }) || null
    );
  }

  async function cargarCatalogos() {
    if (catalogos.variedades.length && catalogos.geneticas.length) return catalogos;
    try {
      const res = await fetch('catalogos.json', { cache: 'force-cache' });
      if (res.ok) {
        const data = await res.json();
        if (data?.variedades?.length) {
          catalogos.variedades = data.variedades.map(normalizarCatalogoItem);
        }
        if (data?.geneticas?.length) {
          catalogos.geneticas = data.geneticas.map(normalizarCatalogoItem);
        }
      }
    } catch (e) {
      /* offline: usar caché del service worker o vacío */
    }
    return catalogos;
  }

  function bindMetaSelects() {
    $$('[data-variedad-meta]').forEach((sel) => {
      if (sel.dataset.metaSelectInit === '1') return;
      sel.dataset.metaSelectInit = '1';
      sel.addEventListener('change', () => {
        syncFromDom();
        const vId = sel.dataset.variedadMeta;
        const v = variedades.find((x) => x.id === vId);
        const vWrap = sel.closest('.variedad-wrap');
        if (vWrap && v) actualizarEncabezadoVariedadWrap(vWrap, v);
        actualizarHeaderContext();
        programarAutoguardadoBorrador();
      });
    });
  }

  function bindVariedadEvents() {
    $$('#variedades-container input[data-field]').forEach((inp) => {
      inp.addEventListener('input', onMuestraInput);
    });
    $$('.variedad-wrap-trigger').forEach((btn) => {
      btn.addEventListener('click', () => {
        const vId = btn.dataset.variedad;
        const v = variedades.find((x) => x.id === vId);
        const wrap = btn.closest('.variedad-wrap');
        if (!v || !wrap) return;
        const open = !wrap.classList.contains('is-open');
        v.abierta = open;
        wrap.classList.toggle('is-open', open);
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        programarAutoguardadoBorrador();
      });
    });
    bindMetaSelects();
    $$('.btn-agregar-muestra-despues').forEach((btn) => {
      btn.addEventListener('click', () => {
        syncFromDom();
        const v = variedades.find((x) => x.id === btn.dataset.variedad);
        if (!v) return;
        const idx = v.muestras.findIndex((m) => m.id === btn.dataset.muestra);
        v.muestras.splice(idx >= 0 ? idx + 1 : v.muestras.length, 0, crearMuestraVacia());
        renderVariedades();
        programarAutoguardadoBorrador();
      });
    });
    $$('.btn-quitar-muestra').forEach((btn) => {
      btn.addEventListener('click', async () => {
        syncFromDom();
        const v = variedades.find((x) => x.id === btn.dataset.variedad);
        if (!v || v.muestras.length <= 1) return;
        const n = numeroFilaMuestra(btn.dataset.variedad, btn.dataset.muestra);
        const r = await Swal.fire({
          title: '¿Eliminar fila?',
          html: `Se quitará la <strong>fila ${n}</strong> de este bloque.`,
          icon: 'warning',
          showCancelButton: true,
          confirmButtonText: 'Sí, eliminar',
          cancelButtonText: 'Cancelar',
          confirmButtonColor: '#dc3545',
        });
        if (!r.isConfirmed) return;
        v.muestras = v.muestras.filter((m) => m.id !== btn.dataset.muestra);
        renderVariedades();
        guardarBorrador(true);
      });
    });
    $$('.defectos-toggle').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        abrirModalDefectos(btn.dataset.variedad, btn.dataset.muestra);
      });
    });
    $$('.obs-toggle').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        abrirModalObservaciones(btn.dataset.variedad, btn.dataset.muestra);
      });
    });
    $$('.btn-quitar-variedad').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const v = variedades.find((x) => x.id === btn.dataset.variedad);
        const nombre = v?.variedad?.trim() || 'este bloque';
        const r = await Swal.fire({
          title: '¿Eliminar variedad?',
          html: `Se quitará <strong>${escapeHtml(nombre)}</strong> y todas sus filas de muestra.`,
          icon: 'warning',
          showCancelButton: true,
          confirmButtonText: 'Sí, eliminar',
          cancelButtonText: 'Cancelar',
          confirmButtonColor: '#dc3545',
        });
        if (!r.isConfirmed) return;
        syncFromDom();
        variedades = variedades.filter((x) => x.id !== btn.dataset.variedad);
        if (!variedades.length) variedades = [crearVariedadVacia(true)];
        renderVariedades();
        guardarBorrador(true);
        actualizarHeaderContext();
      });
    });
  }

  let modalFilaCtx = null;

  function obtenerMuestra(vId, mId) {
    const v = variedades.find((x) => x.id === vId);
    return v?.muestras.find((x) => x.id === mId) || null;
  }

  function numeroFilaMuestra(vId, mId) {
    const v = variedades.find((x) => x.id === vId);
    if (!v) return 1;
    const idx = v.muestras.findIndex((m) => m.id === mId);
    return idx >= 0 ? idx + 1 : 1;
  }

  function btnFilaEnDom(vId, mId, tipo) {
    return document.querySelector(
      `.${tipo}-toggle[data-variedad="${vId}"][data-muestra="${mId}"]`
    );
  }

  function actualizarBadgeObs(btn, hasObs) {
    if (!btn) return;
    let badge = btn.querySelector('.fila-btn-badge');
    if (hasObs) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'fila-btn-badge fila-btn-badge--dot';
        badge.setAttribute('aria-hidden', 'true');
        btn.appendChild(badge);
      }
      btn.setAttribute('aria-label', 'Observaciones (con texto)');
    } else {
      badge?.remove();
      btn.setAttribute('aria-label', 'Observaciones');
    }
  }

  function cerrarModalFila(id) {
    $(id)?.classList.remove('open');
    modalFilaCtx = null;
  }

  function abrirModalDefectos(vId, mId) {
    syncFromDom();
    const m = obtenerMuestra(vId, mId);
    if (!m) return;

    modalFilaCtx = { vId, mId, tipo: 'defectos' };
    const filaEl = $('#modal-defectos-fila');
    if (filaEl) filaEl.textContent = String(numeroFilaMuestra(vId, mId));

    const body = $('#modal-defectos-body');
    if (body) {
      body.innerHTML = `
        <div class="modal-defectos-grid">
          ${C.DEFECTOS.map(
            (d) => `
            <div class="field defecto-field">
              <label>${d.label}</label>
              <input type="number" inputmode="decimal" step="0.01" min="0"
                data-field="${d.key}" value="${escapeHtml(m[d.key] ?? '')}" placeholder="0" />
            </div>`
          ).join('')}
        </div>`;
    }

    $('#modal-defectos')?.classList.add('open');
    initLucide();
    body?.querySelector('input')?.focus();
  }

  function guardarModalDefectos() {
    if (!modalFilaCtx || modalFilaCtx.tipo !== 'defectos') return;
    const m = obtenerMuestra(modalFilaCtx.vId, modalFilaCtx.mId);
    if (!m) return;

    $$('#modal-defectos-body input[data-field]').forEach((inp) => {
      m[inp.dataset.field] = inp.value;
    });

    actualizarBadgeDefectos(
      btnFilaEnDom(modalFilaCtx.vId, modalFilaCtx.mId, 'defectos'),
      contarDefectos(m)
    );
    cerrarModalFila('#modal-defectos');
    programarAutoguardadoBorrador();
  }

  function abrirModalObservaciones(vId, mId) {
    syncFromDom();
    const m = obtenerMuestra(vId, mId);
    if (!m) return;

    modalFilaCtx = { vId, mId, tipo: 'obs' };
    const filaEl = $('#modal-obs-fila');
    if (filaEl) filaEl.textContent = String(numeroFilaMuestra(vId, mId));

    const inp = $('#modal-obs-input');
    if (inp) inp.value = m.observaciones || '';

    $('#modal-observaciones')?.classList.add('open');
    initLucide();
    inp?.focus();
  }

  function guardarModalObservaciones() {
    if (!modalFilaCtx || modalFilaCtx.tipo !== 'obs') return;
    const m = obtenerMuestra(modalFilaCtx.vId, modalFilaCtx.mId);
    if (!m) return;

    const inp = $('#modal-obs-input');
    m.observaciones = inp?.value?.trim() || '';

    actualizarBadgeObs(
      btnFilaEnDom(modalFilaCtx.vId, modalFilaCtx.mId, 'obs'),
      !!m.observaciones
    );
    cerrarModalFila('#modal-observaciones');
    programarAutoguardadoBorrador();
  }

  function initModalesFila() {
    $('#modal-defectos-ok')?.addEventListener('click', guardarModalDefectos);
    $('#modal-obs-ok')?.addEventListener('click', guardarModalObservaciones);
    $('#modal-defectos-cerrar')?.addEventListener('click', () => cerrarModalFila('#modal-defectos'));
    $('#modal-obs-cerrar')?.addEventListener('click', () => cerrarModalFila('#modal-observaciones'));
    $('#modal-defectos')?.addEventListener('click', (e) => {
      if (e.target.id === 'modal-defectos') cerrarModalFila('#modal-defectos');
    });
    $('#modal-observaciones')?.addEventListener('click', (e) => {
      if (e.target.id === 'modal-observaciones') cerrarModalFila('#modal-observaciones');
    });
  }

  function actualizarBadgeDefectos(btn, n) {
    if (!btn) return;
    let badge = btn.querySelector('.fila-btn-badge');
    if (n > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'fila-btn-badge';
        btn.appendChild(badge);
      }
      badge.textContent = String(n);
      btn.setAttribute('aria-label', `Defectos (${n})`);
    } else {
      badge?.remove();
      btn.setAttribute('aria-label', 'Defectos');
    }
  }

  function onMuestraInput(e) {
    const inp = e.target;
    const vId = inp.dataset.variedad;
    const mId = inp.dataset.muestra;
    const field = inp.dataset.field;
    const v = variedades.find((x) => x.id === vId);
    const m = v && v.muestras.find((x) => x.id === mId);
    if (!m) return;
    m[field] = inp.value;

    programarAutoguardadoBorrador();
  }

  function validarFormulario() {
    syncFromDom();
    const errores = [];
    const fechaCosechaVal = obtenerFechaCosecha();

    if (!variedades.length) errores.push('Agregue al menos una variedad');

    variedades.forEach((v, vi) => {
      if (!v.variedad.trim()) errores.push(`Fila ${vi + 1}: falta Variedad`);
      if (!v.genetica.trim()) errores.push(`Fila ${vi + 1}: falta Genética`);
      let tieneDato = false;
      v.muestras.forEach((m) => {
        if (parseNum(m.peso) != null) tieneDato = true;
      });
      if (!tieneDato) errores.push(`"${v.variedad || vi + 1}": al menos un Peso muestras`);
    });

    return { ok: errores.length === 0, errores, fechaCosecha: fechaCosechaVal };
  }

  /** Solo campos del formulario IN-ID-FO-001 (+ uid técnico para sincronizar) */
  function filaDesdeFormulario(v, m, sesion, filaVar, filaMuestra, uidBase) {
    const peso = parseNum(m.peso);
    const nb = parseNum(m.n_bayas);
    const pp = parseNum(m.pp_baya);

    return {
      uid: filaMuestra === 1 && filaVar === 1 ? uidBase : `${uidBase}_r${filaVar}_${filaMuestra}`,
      fecha_cosecha: sesion.fechaCosecha,
      t_ambiente: sesion.tAmbiente,
      t_pulpa: sesion.tPulpa,
      variedad: v.variedad,
      variedad_id: v.variedad_id || '',
      genetica: v.genetica,
      genetica_id: v.genetica_id || '',
      peso_muestra: peso,
      pp_baya: pp,
      n_bayas: nb,
      herida_abierta: parseNum(m.herida_abierta),
      russet: parseNum(m.russet),
      deshidratado: parseNum(m.deshidratado),
      sin_pruina: parseNum(m.sin_pruina),
      desgarro: parseNum(m.desgarro),
      exudacion: parseNum(m.exudacion),
      r_floral: parseNum(m.r_floral),
      pedunculo: parseNum(m.pedunculo),
      brix: parseNum(m.brix),
      acidez: parseNum(m.acidez),
      observaciones: m.observaciones || '',
      session_id: sessionId,
      fila_variedad: filaVar,
      fila_muestra: filaMuestra,
    };
  }

  function obtenerUidEnvio() {
    if (!envioUidActivo) envioUidActivo = C.generarUid();
    return envioUidActivo;
  }

  function reiniciarUidEnvio() {
    envioUidActivo = null;
  }

  function construirPayload() {
    syncFromDom();
    const uid = obtenerUidEnvio();
    const sesion = {
      fechaCosecha: obtenerFechaCosecha(),
      tAmbiente: parseNum($('#t-ambiente').value),
      tPulpa: parseNum($('#t-pulpa').value),
    };

    const filas = [];
    let filaVar = 0;

    variedades.forEach((v) => {
      filaVar++;
      let filaMuestra = 0;
      v.muestras.forEach((m) => {
        if (parseNum(m.peso) == null) return;
        filaMuestra++;
        filas.push(filaDesdeFormulario(v, m, sesion, filaVar, filaMuestra, uid));
      });
    });

    const payloadStr = JSON.stringify(filas);
    return {
      accion: 'registrar_cosecha',
      uid,
      session_id: sessionId,
      filas,
      hash_payload: C.hashSimple(payloadStr),
      meta: {
        app_version: C.APP_VERSION,
        filas_count: filas.length,
        formulario: C.FORM_META.codigo,
      },
    };
  }

  const LOADER_AVISO_NO_CERRAR = 'Espere un momento. No cierre ni recargue la página.';

  function mostrarLoaderEnvio(titulo, sub) {
    const el = $('#loader-envio');
    if (!el) return;
    const t = $('#loader-envio-title');
    const s = $('#loader-envio-sub');
    const h = $('#loader-envio-hint');
    if (t) t.textContent = titulo || 'Guardando registro';
    if (s) s.textContent = sub || 'Conectando con la planilla…';
    if (h) h.textContent = LOADER_AVISO_NO_CERRAR;
    el.hidden = false;
    initLucide();
  }

  function ocultarLoaderEnvio() {
    const el = $('#loader-envio');
    if (el) el.hidden = true;
  }

  function actualizarLoaderEnvio(sub) {
    const s = $('#loader-envio-sub');
    if (s && sub) s.textContent = sub;
  }

  function setBotonEnviarCargando(activo) {
    const btn = $('#btn-enviar');
    if (!btn) return;
    btn.disabled = !!activo;
    btn.setAttribute('aria-busy', activo ? 'true' : 'false');
    btn.classList.toggle('is-enviando', !!activo);
  }

  async function enviarRegistro() {
    if (envioRegistroEnCurso) return;

    if (!C.getApiUrl()) {
      const { value: url } = await Swal.fire({
        title: 'URL de Apps Script',
        input: 'url',
        inputLabel: 'Pegue la URL del Web App (Implementar como aplicación web)',
        inputPlaceholder: 'https://script.google.com/macros/s/.../exec',
        showCancelButton: true,
        confirmButtonText: 'Guardar y continuar',
      });
      if (!url) return;
      C.setApiUrl(url);
    }

    const val = validarFormulario();
    if (!val.ok) {
      Swal.fire({ icon: 'error', title: 'Validación', html: val.errores.join('<br>') });
      return;
    }

    const payload = construirPayload();
    if (!payload.filas.length) {
      Swal.fire({ icon: 'error', title: 'Sin filas', text: 'No hay datos de peso para enviar.' });
      return;
    }

    envioRegistroEnCurso = true;
    setBotonEnviarCargando(true);
    mostrarLoaderEnvio('Guardando registro', 'Esto puede tardar unos segundos…');

    try {
      actualizarLoaderEnvio('Confirmando en el servidor. Siga esperando…');
      const res = await N.enviarRegistroConConfirmacion(payload, {
        validarNumMuestra: false,
      });
      actualizarPendientes();

      if (res.duplicado_uid) {
        reiniciarUidEnvio();
        await Swal.fire({
          icon: 'info',
          title: 'Ya estaba guardado',
          text: res.mensaje || 'Este registro ya se había enviado antes.',
        });
        if (res.confirmado) limpiarFormulario(true);
        return;
      }

      if (!res.ok && !res.en_cola) {
        await Swal.fire({ icon: 'error', title: 'No confirmado', text: res.mensaje });
        return;
      }

      const icon = res.confirmado ? 'success' : res.en_cola ? 'info' : 'warning';
      await Swal.fire({
        icon,
        title: res.confirmado ? '¡Registrado!' : res.en_cola ? 'En cola' : 'Atención',
        text: res.mensaje,
      });

      if (res.confirmado) {
        reiniciarUidEnvio();
        limpiarFormulario(true);
      }
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Error', text: e.message });
    } finally {
      envioRegistroEnCurso = false;
      setBotonEnviarCargando(false);
      ocultarLoaderEnvio();
    }
  }

  /** @param {boolean} eliminarBorrador - true solo tras envío exitoso */
  function limpiarFormulario(eliminarBorrador) {
    const borrar = eliminarBorrador !== false;
    sincronizarFechaHoyVisual();
    $('#t-ambiente').value = '';
    $('#t-pulpa').value = '';
    variedades = [crearVariedadVacia(true)];
    sessionId = C.generarSessionId();
    reiniciarUidEnvio();
    renderVariedades();
    if (borrar) {
      localStorage.removeItem(C.STORAGE_KEYS.BORRADOR);
    }
  }

  function initFechaCosecha() {
    sincronizarFechaHoyVisual();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') sincronizarFechaHoyVisual();
    });
    setInterval(sincronizarFechaHoyVisual, 60000);
  }

  function enlazarAutoguardadoFormulario() {
    const root = document.querySelector('.app-main');
    if (!root) return;
    root.addEventListener('input', (e) => {
      if (e.target.matches('input, textarea, select')) programarAutoguardadoBorrador();
    });
    root.addEventListener('change', (e) => {
      if (e.target.matches('input, textarea, select')) programarAutoguardadoBorrador();
    });
  }

  function initTimePicker() {
    const hSel = $('#picker-hora');
    const mSel = $('#picker-min');
    if (!hSel || !mSel) return;
    for (let h = 0; h < 24; h++) hSel.innerHTML += `<option value="${pad2(h)}">${pad2(h)}</option>`;
    for (let m = 0; m < 60; m += 5) mSel.innerHTML += `<option value="${pad2(m)}">${pad2(m)}</option>`;
  }

  window.abrirPickerHora = function (callback, valorActual) {
    horaCallback = callback;
    const modal = $('#modal-hora');
    if (!modal) return;
    const parts = (valorActual || '08:00').split(':');
    $('#picker-hora').value = parts[0] || '08';
    $('#picker-min').value = parts[1] || '00';
    modal.classList.add('open');
  };

  function cerrarPickerHora() {
    $('#modal-hora')?.classList.remove('open');
    if (horaCallback) {
      const v = `${$('#picker-hora').value}:${$('#picker-min').value}`;
      horaCallback(v);
      horaCallback = null;
    }
  }

  async function mostrarMenu() {
    const items = {
      config: 'Configurar URL Apps Script',
      cola: 'Procesar cola pendiente',
      borrador: 'Info del borrador local',
      limpiar: 'Nuevo formulario (vacío)',
    };
    const { value } = await Swal.fire({
      title: 'Menú',
      input: 'select',
      inputOptions: items,
      showCancelButton: true,
    });
    if (!value) return;

    if (value === 'config') {
      const { value: url } = await Swal.fire({
        title: 'URL Apps Script',
        input: 'url',
        inputValue: C.getApiUrl(),
        showCancelButton: true,
      });
      if (url) {
        C.setApiUrl(url);
        actualizarEstadoRed();
        Swal.fire('URL guardada', '', 'success');
      }
    } else if (value === 'cola') {
      Swal.fire({ title: 'Procesando cola…', didOpen: () => Swal.showLoading() });
      const r = await N.procesarColaPendientes();
      actualizarPendientes();
      Swal.fire('Cola', `Pendientes: ${r.pendientes ?? N.colaOffline.contar()}`, 'info');
    } else if (value === 'borrador') {
      const data = leerBorradorRaw();
      if (!borradorTieneDatos(data)) {
        Swal.fire({
          icon: 'info',
          title: 'Borrador local',
          html: '<p>No hay borrador guardado.</p><p><small>Al escribir, se guarda solo en el teléfono y <strong>no se pierde</strong> al cerrar la app.</small></p>',
        });
      } else {
        const g = data.guardado ? new Date(data.guardado).toLocaleString('es-CL') : '—';
        Swal.fire({
          icon: 'info',
          title: 'Borrador local activo',
          html:
            `<p><strong>Último guardado:</strong> ${g}</p>` +
            '<p>Permanece aunque cierre la PWA sin enviar.</p>' +
            '<p><small>Se elimina solo al <strong>enviar con éxito</strong> o al pulsar <strong>Descartar borrador</strong>.</small></p>',
        });
      }
    } else if (value === 'limpiar') {
      const c = await Swal.fire({
        title: '¿Nuevo formulario?',
        html: 'Vacía la pantalla. El borrador guardado <strong>se mantiene</strong> salvo que lo descarte.',
        icon: 'question',
        showCancelButton: true,
      });
      if (c.isConfirmed) limpiarFormulario(false);
    }
  }

  function actualizarGuiaPasos() {
    const el = $('#pasos-nube');
    if (!el) return;
    const mostrar = variedades.length === 1;
    el.classList.toggle('is-hidden', !mostrar);
    if (mostrar) {
      el.style.opacity = '';
      el.style.transform = '';
    }
  }

  function init() {
    if (!variedades.length) variedades = [crearVariedadVacia(true)];
    initFechaCosecha();
    initTimePicker();
    initModalesFila();
    const draftInicio = leerBorradorRaw();
    if (borradorTieneDatos(draftInicio)) {
      restaurarBorradorAlInicio();
    } else {
      renderVariedades();
    }
    initLucide();
    initContextAccordion();
    actualizarFechaFab();
    actualizarHeaderContext();
    enlazarAutoguardadoFormulario();

    window.addEventListener('beforeunload', () => guardarBorrador(true));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') guardarBorrador(true);
    });

    $('#btn-agregar-variedad')?.addEventListener('click', () => {
      syncFromDom();
      preservarEstadoAcordeonVariedades();
      variedades.forEach((v) => {
        v.abierta = false;
      });
      const nv = crearVariedadVacia(true);
      variedades.push(nv);
      renderVariedades();
      guardarBorrador(true);
    });

    $('#btn-enviar')?.addEventListener('click', enviarRegistro);
    $('#btn-hora-ok')?.addEventListener('click', cerrarPickerHora);
    $('#modal-hora')?.addEventListener('click', (e) => {
      if (e.target.id === 'modal-hora') cerrarPickerHora();
    });

    ['#t-ambiente', '#t-pulpa'].forEach((sel) => {
      $(sel)?.addEventListener('input', () => {
        $(sel)?.classList.remove('error');
        actualizarHeaderContext();
        programarAutoguardadoBorrador();
      });
    });

    window.addEventListener('online', () => {
      actualizarEstadoRed();
      N.procesarColaPendientes().then(actualizarPendientes);
    });
    window.addEventListener('offline', actualizarEstadoRed);
    window.addEventListener('cola-offline-change', actualizarPendientes);

    actualizarEstadoRed();
    N.procesarColaPendientes();
    setInterval(actualizarPendientes, 5000);
  }

  async function bootstrap() {
    await cargarCatalogos();
    init();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
