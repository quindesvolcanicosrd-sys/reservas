// Reglamento de roller derby (Victor, 2026-11-28). Convierte el Google Doc de
// Victor (exportado a markdown) en datos para la app: partes, secciones,
// escenarios del libro de casos, glosario y faltas con su señal. Sin APIs de
// Deno, para poder correrlo también con node (scripts/reglamento.mjs) y dejar
// una copia dentro de la app que funcione sin internet.

export type Seccion = { id: string; parte: string; num: string; titulo: string; nivel: number; md: string };
export type Caso = { id: string; seccion: string; texto: string; resultado: string; explicacion: string; extra: string };
export type Termino = { t: string; en: string; def: string; grupo: string };
export type Falta = { codigo: string; nombre: string; en: string; seccion: string; senal: string; nota: string };
export type Parte = { id: string; titulo: string; subtitulo: string; secciones: string[] };
export type Reglamento = {
  version: string;
  partes: Parte[];
  secciones: Seccion[];
  casos: Caso[];
  glosario: Termino[];
  faltas: Falta[];
  /** Línea de créditos de WFTDA (trae la fecha de la versión de las reglas). */
  creditos: string[];
};

// Partes del documento, en el orden en que aparecen. El Manual del Statsbook
// queda fuera: Pivot llena el statsbook solo (Victor, 2026-11-28).
const PARTES: [string, string][] = [
  ['reglas', 'Reglas del Roller Derby en Pista Plana'],
  ['casos', 'Libro de casos'],
  ['riesgos', 'Directrices en Gestión de Riesgos'],
  ['senales', 'Indicaciones, códigos y señales de arbitraje'],
  ['procedimientos', 'Procedimientos de arbitraje'],
  ['glosario', 'Glosario'],
  ['nso', 'Formación para NSOs'],
  ['statsbook', 'Manual del Statsbook'],
];
const FUERA = new Set(['statsbook']);

// Sección de las reglas de cada código de falta de WFTDA (estable entre
// versiones; se usa cuando el documento no trae el número exacto).
const SECCION_FALTA: Record<string, string> = {
  B: '4.1.1', A: '4.1.1', L: '4.1.1', H: '4.1.2', F: '4.1.2', E: '4.1.2', C: '4.1.3', D: '4.1.3',
  M: '4.1.4', P: '4.2.1', X: '4.2.2', N: '4.2.3', I: '4.2.4', G: '4.3',
};

const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const clave = (s: string) => sinAcentos(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const slug = (s: string) => clave(s).replace(/ /g, '-').slice(0, 60);

/** Título de un encabezado sin #, asteriscos ni barras. */
function titulo(linea: string): string {
  return linea.replace(/^#+\s*/, '').replace(/\\/g, '').replace(/\*/g, '').replace(/\s+/g, ' ').trim();
}

function parteDe(linea: string): string | null {
  if (!/^# /.test(linea)) return null;
  const resto = linea.slice(2).trim();
  if (resto.startsWith('**')) return null; // encabezados en negrita son contenido, no partes
  const t = clave(titulo(linea).replace(/^[^A-Za-zÁÉÍÓÚÑáéíóúñ]+/, ''));
  for (const [id, nombre] of PARTES) if (t === clave(nombre)) return id;
  return null;
}

const esSeparador = (l: string) => /^#?\s*\\?-{3,}\s*$/.test(l.trim());
const esIndice = (l: string) => /^#{1,3}\s*\**\s*Índice\s*\**\s*$/.test(l.trim());

function fnv(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export function procesarReglamento(md: string): Reglamento {
  const lineas = md.replace(/\r/g, '').split('\n');

  // 1) Partes: cortes por los encabezados de pestaña.
  type Bloque = { id: string; lineas: string[] };
  const bloques: Bloque[] = [];
  let actual: Bloque | null = null;
  for (const l of lineas) {
    const p = parteDe(l);
    if (p && (!actual || actual.id !== p) && !bloques.some((b) => b.id === p)) {
      actual = { id: p, lineas: [] };
      bloques.push(actual);
      continue;
    }
    if (p && actual && actual.id === p) continue; // título repetido debajo del de la pestaña
    actual?.lineas.push(l);
  }

  // 2) Índices: texto del índice → id del encabezado de Google (#heading=h.xxx),
  //    para convertir los enlaces internos del documento en enlaces de la app.
  const porHeading = new Map<string, { parte: string; titulo: string }>();
  for (const b of bloques) {
    let enIndice = false;
    for (const l of b.lineas) {
      if (esIndice(l)) { enIndice = true; continue; }
      if (!enIndice) continue;
      if (esSeparador(l) || /^#{1,3} /.test(l)) { enIndice = false; continue; }
      const m = l.match(/^\[(.+?)\]\([^)]*#heading=(h\.[a-z0-9]+)\)/i);
      if (m) porHeading.set(m[2], { parte: b.id, titulo: clave(titulo(m[1])) });
    }
  }

  const secciones: Seccion[] = [];
  const casos: Caso[] = [];
  const glosario: Termino[] = [];
  const faltas: Falta[] = [];
  const partes: Parte[] = [];
  const pendientesHeading: { s: Seccion }[] = [];

  const enlace = (texto: string, url: string): string => {
    const t = texto.trim();
    if (!t) return '';
    if (url === 'about:blank') {
      const p = PARTES.find(([, n]) => clave(t).startsWith(clave(n)));
      return p && !FUERA.has(p[0]) ? `[${t}](pivot:p/${p[0]})` : t;
    }
    const h = url.match(/#heading=(h\.[a-z0-9]+)/i);
    if (h) return `[${t}](pivot:h/${h[1]})`;
    if (/docs\.google\.com\/document/.test(url)) {
      const n = clave(t).match(/(\d+(?: \d+)*)/);
      return n && /\d/.test(t) ? `[${t}](pivot:n/${n[1].replace(/ /g, '.')})` : t;
    }
    if (/^https?:\/\//.test(url)) return `[${t}](${url})`;
    return t;
  };

  const limpiar = (l: string): string => {
    let s = l.replace(/&#10;/g, '⏎').replace(/ /g, ' ');
    s = s.replace(/\\([*_\[\]()#\-.!|~>`+])/g, '$1');
    s = s.replace(/\*{4,}/g, '');
    s = s.replace(/\*\*\s+\*\*/g, ' ');
    s = s.replace(/\[([^\]]*)\]\(([^)\s]*)\)/g, (_, t, u) => enlace(t, u));
    s = s.replace(/[ \t]+$/g, '');
    return s;
  };

  for (const b of bloques) {
    if (FUERA.has(b.id)) continue;
    const nombre = PARTES.find(([id]) => id === b.id)![1];
    const parte: Parte = { id: b.id, titulo: nombre, subtitulo: '', secciones: [] };
    partes.push(parte);
    let sec: Seccion | null = null;
    let enIndice = false;
    let sub: { tipo: 'caso' | 'termino' | 'falta' | 'md'; titulo: string; lineas: string[] } | null = null;
    let grupo = '';
    const usados = new Set<string>();

    const cerrarSub = () => {
      if (!sub) return;
      const texto = sub.lineas.map(limpiar).filter((x) => !/^\s*\**\s*$/.test(x));
      if (sub.tipo === 'caso') {
        const id = (sub.titulo.match(/C\d[\d.]*[A-Z]/) ?? [''])[0];
        const seccion = id.replace(/^C/, '').replace(/\.[A-Z]$/, '');
        const partesCaso: Record<string, string[]> = { texto: [], resultado: [], explicacion: [], extra: [] };
        let k = 'texto';
        for (const x of texto) {
          const m = x.match(/^\*\*\s*(Resultado|Explicación|Explicacion)\s*:?\s*\*\*\s*:?\s*(.*)$/i);
          if (m) {
            k = clave(m[1]).startsWith('result') ? 'resultado' : 'explicacion';
            if (m[2]) partesCaso[k].push(m[2]);
            continue;
          }
          if (k !== 'texto' && /^\*\*[^*]{2,40}:\s*\*\*/.test(x)) k = 'extra';
          partesCaso[k].push(x);
        }
        const j = (a: string[]) => a.join('\n').replace(/\n{3,}/g, '\n\n').trim();
        if (id) casos.push({ id, seccion, texto: j(partesCaso.texto), resultado: j(partesCaso.resultado), explicacion: j(partesCaso.explicacion), extra: j(partesCaso.extra) });
      } else if (sub.tipo === 'termino') {
        const m = sub.titulo.match(/^(.+?)\s*\(([^)]*)\)?\s*$/);
        const t = (m ? m[1] : sub.titulo).trim();
        const en = m ? m[2].replace(/\)$/, '').trim() : '';
        const def = texto.join('\n').replace(/\n{3,}/g, '\n\n').trim();
        if (t) glosario.push({ t, en, def, grupo });
      } else if (sub.tipo === 'falta') {
        const m = sub.titulo.match(/^([A-Z0-9]{1,3})\s*[-–]\s*(.+?)\s*(?:\((.+?)\))?\s*$/)!;
        let celda = texto.join('⏎').replace(/\|/g, '⏎').replace(/:-:/g, '');
        const i = celda.indexOf('Señal');
        if (i >= 0) celda = celda.slice(i + 'Señal'.length);
        celda = celda.replace(/&#10;/g, '⏎').replace(/\\/g, '');
        const pasos: string[] = [];
        const nota: string[] = [];
        for (const x of celda.split('⏎').map((y) => y.replace(/\*/g, '').replace(/-{3,}/g, '').trim()).filter((y) => y && y !== 'Di')) {
          const corte = x.slice(4).search(/[.)](?=[A-ZÁÉÍÓÚ“"][a-záéíóú])/);
          if (/^\d+\.\s/.test(x) && corte >= 0) { pasos.push(x.slice(0, corte + 5).trim()); nota.push(x.slice(corte + 5).trim()); }
          else if (/^\d+\.\s/.test(x) && nota.length === 0) pasos.push(x);
          else nota.push(x);
        }
        const num = sec?.num ?? '';
        const seccion = num.split('.').length >= 3 ? num : SECCION_FALTA[m[1]] ?? num;
        faltas.push({ codigo: m[1], nombre: m[2].trim(), en: (m[3] ?? '').trim(), seccion, senal: pasos.join('\n'), nota: nota.join('\n').replace(/([.:])(?=[A-ZÁÉÍÓÚ“"])/g, '$1\n') });
      } else if (sec) {
        sec.md += `\n\n#### ${sub.titulo}\n\n${texto.join('\n')}`;
      }
      sub = null;
    };

    const nueva = (l: string, nivel: number) => {
      cerrarSub();
      const t = titulo(l);
      const num = (t.match(/^(\d+(?:\.\d+)*)\.?\s/) ?? ['', ''])[1];
      let id = `${b.id}:${num || slug(t)}`;
      while (usados.has(id)) id += '+';
      usados.add(id);
      sec = { id, parte: b.id, num, titulo: num ? t.slice(t.indexOf(num) + num.length).replace(/^\.?\s*/, '') : t, nivel, md: '' };
      secciones.push(sec);
      parte.secciones.push(id);
      if (b.id === 'glosario') grupo = t;
    };

    for (let i = 0; i < b.lineas.length; i++) {
      const l = b.lineas[i];
      if (esIndice(l)) { cerrarSub(); enIndice = true; continue; }
      if (enIndice) {
        if (esSeparador(l) || (/^#{1,3} /.test(l) && !/^#+\s*\[/.test(l))) enIndice = false;
        else continue;
      }
      if (esSeparador(l)) continue;
      if (/^\s*\[\]\([^)]*\)\s*$/.test(l)) continue; // botones vacíos «volver al índice»
      if (/El diseño de este documento ha sido optimizado/.test(l)) continue;
      const h = l.match(/^(#{1,6})\s/);
      if (h) {
        const nivel = h[1].length;
        const t = titulo(l);
        if (!t) continue;
        // Subtítulo de la pestaña (encabezado sin negrita justo debajo).
        if (nivel === 1 && !sec && !l.slice(2).trim().startsWith('**')) {
          parte.subtitulo = parte.subtitulo || t;
          continue;
        }
        if (nivel <= 3) {
          nueva(l, nivel);
          continue;
        }
        cerrarSub();
        if (b.id === 'casos' && /^Escenario\s+C\d/.test(t)) sub = { tipo: 'caso', titulo: t, lineas: [] };
        else if (b.id === 'glosario') sub = { tipo: 'termino', titulo: t, lineas: [] };
        else if (b.id === 'senales' && /^[A-Z0-9]{1,3}\s*[-–]\s*\S/.test(t)) sub = { tipo: 'falta', titulo: t, lineas: [] };
        else sub = { tipo: 'md', titulo: t, lineas: [] };
        continue;
      }
      if (sub) sub.lineas.push(l);
      else if (sec) (sec as Seccion).md += '\n' + limpiar(l);
      else if (l.trim()) {
        nueva('## Introducción', 2);
        (sec as unknown as Seccion).md += '\n' + limpiar(l);
      }
    }
    cerrarSub();
  }

  // 3) Ajustes finales: texto prolijo y enlaces internos resueltos.
  const porNum = new Map<string, string>();
  for (const s of secciones) if (s.parte === 'reglas' && s.num) porNum.set(s.num, s.id);
  const porTitulo = new Map<string, string>();
  for (const s of secciones) {
    const k = `${s.parte}|${clave((s.num ? s.num + ' ' : '') + s.titulo)}`;
    if (!porTitulo.has(k)) porTitulo.set(k, s.id);
    const k2 = `${s.parte}|${clave(s.titulo)}`;
    if (!porTitulo.has(k2)) porTitulo.set(k2, s.id);
  }
  const resolver = (txt: string) =>
    txt
      .replace(/\(pivot:h\/(h\.[a-z0-9]+)\)/gi, (_, h) => {
        const x = porHeading.get(h);
        const id = x ? porTitulo.get(`${x.parte}|${x.titulo}`) : undefined;
        return `(pivot:s/${id ?? 'x'})`;
      })
      .replace(/\(pivot:n\/([\d.]+?)\.?\)/g, (_, n) => `(pivot:s/${porNum.get(n) ?? porNum.get(n.split('.').slice(0, 2).join('.')) ?? 'x'})`)
      .replace(/\[([^\]]*)\]\(pivot:s\/x\)/g, '$1')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  for (const s of secciones) s.md = resolver(s.md);
  for (const c of casos) {
    c.texto = resolver(c.texto);
    c.resultado = resolver(c.resultado);
    c.explicacion = resolver(c.explicacion);
    c.extra = resolver(c.extra);
  }
  for (const g of glosario) g.def = resolver(g.def);

  // Créditos de WFTDA (© …) fuera del texto; sirven para saber la versión.
  const creditos: string[] = [];
  const sacarCreditos = (t: string) =>
    t
      .split('\n')
      .filter((x) => {
        if (!/©.*WFTDA|WFTDA.*©/.test(x)) return true;
        const c = x.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').trim();
        if (!creditos.includes(c)) creditos.push(c);
        return false;
      })
      .join('\n')
      .trim();
  for (const s of secciones) s.md = sacarCreditos(s.md);
  for (const g of glosario) g.def = sacarCreditos(g.def);
  // Encabezados partidos en dos líneas dentro del glosario («[Zonas B–D.»):
  // el texto va como definición del término anterior.
  for (let i = glosario.length - 1; i > 0; i--) {
    if (!glosario[i].t.startsWith('[')) continue;
    const prev = glosario[i - 1];
    const texto = glosario[i].t.replace(/[\[\]*]/g, '').trim();
    if (!prev.def) prev.def = texto;
    glosario.splice(i, 1);
  }

  // La guía rápida de faltas se ve como lista propia en la app.
  const guia = secciones.filter((s) => s.parte === 'senales' && /Guía Rápida de Penalizaciones/i.test(s.titulo)).map((s) => s.id);
  const fuera = new Set(guia);
  // Encabezados sin número ni texto ni secciones debajo (restos del documento).
  for (let i = 0; i < secciones.length; i++) {
    const s = secciones[i];
    const sig = secciones[i + 1];
    const conHijos = sig && sig.parte === s.parte && sig.nivel > s.nivel;
    if (!s.md && !s.num && !conHijos) fuera.add(s.id);
  }
  const finales = secciones.filter((s) => !fuera.has(s.id));
  for (const p of partes) p.secciones = p.secciones.filter((id) => !fuera.has(id));

  const datos = { partes, secciones: finales, casos, glosario, faltas, creditos };
  return { version: fnv(JSON.stringify(datos)), ...datos };
}
