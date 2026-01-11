/* =========================
   CONSTANTS & STATE
========================= */
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const PERIODS = 6;
const MAX_CLASSES = 8;
const LOCAL_STORAGE_KEY = 'autoscheduler_data';

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
   DATABASE (ONLINE IMPORT)
========================= */
async function loadData() {
    try {
        const response = await fetch(
            "https://3amcode.github.io/Auto-Scheduler-Pro/database.json"
        );

        if (!response.ok) {
            throw new Error("database.json not accessible");
        }

        const data = await response.json();

        if (!Array.isArray(data)) {
            alert("Invalid database format");
            return;
        }

        state.inputs = data;
        saveData();
        renderApp();

        alert(`Database imported successfully (${data.length} classes)`);

    } catch (err) {
        console.error(err);
        alert("Failed to import database.json");
    }
}

/* =========================
   LOCAL STORAGE
========================= */
function saveData() {
    try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state.inputs));
    } catch (e) {
        console.warn("LocalStorage save failed", e);
    }
}

/* =========================
   IMPORT / EXPORT (LOCAL FILE)
========================= */
function exportDatabase() {
    const blob = new Blob(
        [JSON.stringify(state.inputs, null, 2)],
        { type: "application/json" }
    );
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "database.json";
    a.click();

    URL.revokeObjectURL(url);
}

function importDatabase() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";

    input.onchange = e => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = () => {
            try {
                const data = JSON.parse(reader.result);
                if (!Array.isArray(data)) {
                    alert("Invalid file format");
                    return;
                }
                state.inputs = data;
                saveData();
                renderApp();
                alert("Local database imported");
            } catch (err) {
                alert("Invalid JSON file");
            }
        };
        reader.readAsText(file);
    };

    input.click();
}

/* =========================
   GENERATOR LOGIC
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

function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
}

function generateTimetables(classes) {
    const totalSlots = DAYS.length * PERIODS;
    const results = [];

    for (const cls of classes) {
        const grid = Array.from({ length: DAYS.length }, () =>
            Array.from({ length: PERIODS }, () => "Free")
        );

        const pool = [];
        Object.entries(cls.subjects).forEach(([s, c]) => {
            for (let i = 0; i < c; i++) pool.push(s);
        });

        if (pool.length > totalSlots) {
            throw new Error(`${cls.name} has too many subjects`);
        }

        shuffle(pool);
        let idx = 0;

        for (let d = 0; d < DAYS.length; d++) {
            for (let p = 0; p < PERIODS; p++) {
                if (idx < pool.length) {
                    grid[d][p] = pool[idx++];
                }
            }
        }

        results.push({ className: cls.name, grid });
    }

    return results;
}

/* =========================
   APP INIT
========================= */
document.addEventListener("DOMContentLoaded", () => {
    const user = localStorage.getItem("autoscheduler_user");

    if (user) {
        state.isAuthenticated = true;
        state.user = user;

        const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                state.inputs = Array.isArray(parsed) ? parsed : [createEmptyClass()];
            } catch {
                state.inputs = [createEmptyClass()];
            }
        } else {
            state.inputs = [createEmptyClass()];
        }
    }

    renderApp();
});

/* =========================
   UI RENDERING
========================= */
function renderApp() {
    const root = document.getElementById("app");
    root.innerHTML = "";

    if (!state.isAuthenticated) {
        root.innerHTML = `
            <div style="padding:40px;text-align:center">
                <h2>AutoScheduler Pro</h2>
                <button onclick="login()">Login</button>
            </div>
        `;
    } else if (state.results) {
        root.innerHTML = `
            <button onclick="state.results=null;renderApp()">⬅ Back</button>
            ${state.results.map(r =>
                `<h3>${r.className}</h3><pre>${JSON.stringify(r.grid, null, 2)}</pre>`
            ).join("")}
        `;
    } else {
        root.innerHTML = `
            <h2>Setup Classes</h2>
            <button onclick="loadData()">🌐 Import DB</button>
            <button onclick="importDatabase()">📂 Import File</button>
            <button onclick="exportDatabase()">💾 Export</button>
            <button onclick="addClass()">+ Add Class</button>
            <button onclick="handleGenerate()">Generate</button>
            <pre>${JSON.stringify(state.inputs, null, 2)}</pre>
        `;
    }
}

/* =========================
   ACTIONS
========================= */
function login() {
    state.isAuthenticated = true;
    state.user = "rishabhsharma";
    localStorage.setItem("autoscheduler_user", state.user);
    state.inputs = [createEmptyClass()];
    renderApp();
}

function addClass() {
    if (state.inputs.length < MAX_CLASSES) {
        state.inputs.push(createEmptyClass());
        saveData();
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
   GLOBAL EXPORTS
========================= */
window.loadData = loadData;
window.importDatabase = importDatabase;
window.exportDatabase = exportDatabase;
window.addClass = addClass;
window.handleGenerate = handleGenerate;
window.login = login;
