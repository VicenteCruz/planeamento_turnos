/* ============================================
   APP STATE & UTILITIES
   ============================================ */

const AppState = {
    employees: ['MSP', 'CMM', 'JB', 'CPS'],
    shifts: ['8h-17h', '12h-21h'],
    includeNight: false,
    personsPerShift: 2,
    targetRange: [40, 60],
    // calendar[dateStr] = { '8h-17h': ['MSP','CMM'], '12h-21h': ['JB','CPS'], '16h-01h': ['-'] }
    calendar: {},
    dates: [],
    nightDates: new Set(),
};

function toast(msg, type = 'info') {
    const c = document.getElementById('toastContainer');
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = '0.3s'; setTimeout(() => t.remove(), 300); }, 3000);
}

function parseDate(v) {
    if (v instanceof Date) return v;
    if (typeof v === 'number') {
        // Excel serial date
        const d = new Date((v - 25569) * 86400000);
        return d;
    }
    if (typeof v === 'string') {
        v = v.trim();
        // DD/MM/YYYY or DD/mon
        let m;
        if ((m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) {
            return new Date(+m[3], +m[2] - 1, +m[1]);
        }
        if ((m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/))) {
            return new Date(+m[1], +m[2] - 1, +m[3]);
        }
        // "07/may" style
        const months = { jan: 0, fev: 1, feb: 1, mar: 2, apr: 3, abr: 3, may: 4, mai: 4, jun: 5, jul: 6, aug: 7, ago: 7, sep: 8, set: 8, oct: 9, out: 9, nov: 10, dec: 11, dez: 11 };
        if ((m = v.match(/^(\d{1,2})\/(jan|fev|feb|mar|apr|abr|may|mai|jun|jul|aug|ago|sep|set|oct|out|nov|dec|dez)/i))) {
            const mon = months[m[2].toLowerCase()];
            if (mon !== undefined) return new Date(2026, mon, +m[1]);
        }
    }
    return null;
}

function formatDate(d) {
    if (!d) return '';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}`;
}

function formatDateFull(d) {
    if (!d) return '';
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function dateKey(d) {
    return formatDateFull(d);
}

function getDayName(d) {
    const names = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    return names[d.getDay()];
}

function isWeekend(d) {
    return d.getDay() === 0 || d.getDay() === 6;
}

function parsePeople(val) {
    if (!val || val === '-') return [];
    return String(val).split(/\s*\+\s*/).map(s => s.trim()).filter(Boolean);
}
