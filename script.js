/* =========================
   CONSTANTS & STATE
========================= */
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const PERIODS = 6;
const MAX_CLASSES = 8;

let state = {
    isAuthenticated: false,
    user: '',
    inputs: [],
    results: null,
    error: null
};

/* =========================
   HELPERS
========================= */
function createEmptyClass() {
    return {
        id: Date.now().toString(),
        name: 'Class 1',
        subjectsRaw: '',
        teachersRaw: '',
        roomsRaw: ''
    };
}

/* =========================
   DATABASE IMPORT (ONLINE)
========================= */
async function loadData() {
    try {
        const response = await fetch("database.json");

        if (!response.ok) {
            throw new Error("Failed to load database.json");
        }

        const data = await response.json();

        if (Array.isArray(data)) {
            state.inputs = data;
            renderApp();
        } else {
            console.error("Data format is invalid (expected array)");
        }

    } catch (e) {
        console.error("Failed to load data", e);
    }
}

/* =========================
   PARSING & GENERATOR
========================= */
function parseConfigString(str) {
    const map = {};
    if (!str) return map;

    str.split(',').forEach(item => {
        const [k, v] = item.split(':').map(s => s.trim());
        if (k) map[k] = v ? parseInt(v) || v : 1;
    });

    return map;
}

function generateTimetables(classes) {
    const results = [];

    for (const cls of classes) {
        const grid = Array.from({ length: DAYS.length }, () =>
            Array.from({ length: PERIODS }, () => 'Free')
        );

        const pool = [];
        Object.entries(cls.subjects).forEach(([sub, count]) => {
            for (let i = 0; i < count; i++) pool.push(sub);
        });

        let index = 0;
        for (let d = 0; d < DAYS.length; d++) {
            for (let p = 0; p < PERIODS; p++) {
                if (index < pool.length) {
                    grid[d][p] = pool[index++];
                }
            }
        }

        results.push({ className: cls.name, grid });
    }

    return results;
}

/* =========================
   INIT
========================= */
document.addEventListener('DOMContentLoaded', () => {
    state.inputs = [createEmptyClass()];
    renderApp();
});

/* =========================
   RENDERING
========================= */
function renderApp() {
    const root = document.getElementById('app');
    root.innerHTML = '';

    if (!state.results) {
        renderDashboard(root);
    } else {
        renderResults(root);
    }
}

function renderDashboard(root) {
    root.innerHTML = `
        <h2>AutoScheduler</h2>

        <button onclick="loadData()">Import DB</button>
        <button onclick="addClass()">Add Class</button>
        <button onclick="handleGenerate()">Generate Timetable</button>

        <pre>${JSON.stringify(state.inputs, null, 2)}</pre>
    `;
}

function renderResults(root) {
    root.innerHTML = `
        <button onclick="state.results=null;renderApp()">Back</button>
        ${state.results.map(r =>
            `<h3>${r.className}</h3><pre>${JSON.stringify(r.grid, null, 2)}</pre>`
        ).join('')}
    `;
}

/* =========================
   ACTIONS
========================= */
function addClass() {
    if (state.inputs.length < MAX_CLASSES) {
        state.inputs.push(createEmptyClass());
        renderApp();
    }
}

function handleGenerate() {
    try {
        const parsed = state.inputs.map(c => ({
            name: c.name,
            subjects: parseConfigString(c.subjectsRaw)
        }));

        state.results = generateTimetables(parsed);
        renderApp();
    } catch (e) {
        alert(e.message);
    }
}

/* =========================
   GLOBAL EXPORTS (IMPORTANT)
========================= */
window.loadData = loadData;
window.addClass = addClass;
window.handleGenerate = handleGenerate;
