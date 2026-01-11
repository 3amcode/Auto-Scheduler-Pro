
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const PERIODS = 6;
const MAX_CLASSES = 8;
const LOCAL_STORAGE_KEY = 'autoscheduler_data';

let state = {
    isAuthenticated: false,
    user: '',
    inputs: [],
    results: null,
    isGenerating: false,
    error: null,
};

// Helper function to create an empty class
function createEmptyClass() {
    return {
        id: Date.now().toString(),
        name: 'Class 1',
        subjectsRaw: '',
        teachersRaw: '',
        roomsRaw: ''
    };
}

// --- Storage Service ---
// --- Storage Service (Server-Side) ---
// Manual database import - called ONLY when user clicks "Import DB" button
async function loadData() {
    try {
        const response = await fetch("database.json");

        if (!response.ok) {
            throw new Error("Failed to load database.json");
        }

        const data = await response.json();

        if (Array.isArray(data) && data.length > 0) {
            state.inputs = data;
            renderApp();
            alert("Database imported successfully! " + data.length + " classes loaded.");
        } else {
            alert("Database file is empty or invalid.");
        }

    } catch (e) {
        console.error("Failed to import database", e);
        alert("Could not import database. Make sure database.json exists.");
    }
}

// Save to localStorage (works on GitHub Pages - no server needed)
function saveData() {
    try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state.inputs));

        // Visual feedback
        const header = document.querySelector('h1.text-3xl');
        if (header && !header.querySelector('.save-status')) {
            const statusSpan = document.createElement('span');
            statusSpan.className = "text-sm text-green-500 ml-4 font-normal save-status";
            statusSpan.innerText = "(Saved)";
            header.appendChild(statusSpan);
            setTimeout(() => statusSpan.remove(), 1000);
        }
    } catch (e) {
        console.warn("Could not save to localStorage", e);
    }
}

// --- File Import/Export (Notepad Database) ---
function exportDatabase() {
    const dataStr = JSON.stringify(state.inputs, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'database.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function importDatabase() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json, .txt';

    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target.result);
                if (Array.isArray(data)) {
                    state.inputs = data;
                    saveData();
                    renderApp();
                    alert("Database loaded successfully!");
                } else {
                    alert("Invalid file format. Expected a list of classes.");
                }
            } catch (err) {
                alert("Error reading file: " + err.message);
            }
        };
        reader.readAsText(file);
    };

    input.click();
}


// --- Generator Logic ---
function parseConfigString(str) {
    const map = {};
    if (!str) return map;
    str.split(',').forEach(item => {
        const parts = item.split(':').map(s => s.trim());
        if (parts.length === 2 && parts[0]) {
            const key = parts[0];
            const val = parts[1];
            const numVal = parseInt(val, 10);
            map[key] = isNaN(numVal) ? val : numVal;
        } else if (parts.length === 1 && parts[0]) {
            map[parts[0]] = 1;
        }
    });
    return map;
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function generateTimetables(classes) {
    const MAX_ATTEMPTS = 5000;
    const totalSlots = DAYS.length * PERIODS;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const occupiedTeachers = new Set();
        const occupiedRooms = new Set();
        const results = [];
        let failed = false;

        for (const cls of classes) {
            const grid = Array.from({ length: DAYS.length }, () =>
                Array.from({ length: PERIODS }, () => ({ subject: 'Free', teacher: '-', room: '-', isFree: true }))
            );

            const subjectPool = [];
            Object.entries(cls.subjects).forEach(([subj, count]) => {
                for (let i = 0; i < count; i++) subjectPool.push(subj);
            });

            if (subjectPool.length > totalSlots) {
                throw new Error(`Class "${cls.name}" requires ${subjectPool.length} periods, but only ${totalSlots} available.`);
            }
            shuffleArray(subjectPool);

            const slots = [];
            for (let d = 0; d < DAYS.length; d++) {
                for (let p = 0; p < PERIODS; p++) slots.push({ d, p });
            }
            shuffleArray(slots);

            for (const subj of subjectPool) {
                let placed = false;
                for (let i = 0; i < slots.length; i++) {
                    const { d, p } = slots[i];

                    if (!grid[d][p].isFree) continue;

                    const teacher = cls.teachers[subj] || 'Staff';
                    const room = cls.rooms[subj] || 'Homeroom';
                    const tKey = `${teacher}-${d}-${p}`;
                    const rKey = `${room}-${d}-${p}`;

                    if (teacher !== 'Staff' && occupiedTeachers.has(tKey)) continue;
                    if (room !== 'Homeroom' && occupiedRooms.has(rKey)) continue;

                    grid[d][p] = { subject: subj, teacher, room, isFree: false };
                    if (teacher !== 'Staff') occupiedTeachers.add(tKey);
                    if (room !== 'Homeroom') occupiedRooms.add(rKey);

                    slots.splice(i, 1);
                    placed = true;
                    break;
                }
                if (!placed) {
                    failed = true;
                    break;
                }
            }
            if (failed) break;
            results.push({ className: cls.name, grid });
        }
        if (!failed) return results;
    }
    throw new Error("Could not resolve conflicts. Try reducing constraints or subject frequency.");
}

// --- UI Logic ---
document.addEventListener('DOMContentLoaded', () => {
    const savedUser = localStorage.getItem('autoscheduler_user');

    if (savedUser) {
        state.isAuthenticated = true;
        state.user = savedUser;

        // ✅ Try to restore from localStorage (user's own saved work)
        // This does NOT load database.json - that requires clicking "Import DB"
        const savedData = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (savedData) {
            try {
                const parsed = JSON.parse(savedData);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    state.inputs = parsed;
                } else {
                    state.inputs = [createEmptyClass()];
                }
            } catch (e) {
                state.inputs = [createEmptyClass()];
            }
        } else {
            // First time user - start fresh
            state.inputs = [createEmptyClass()];
        }
    }

    renderApp();
});

function renderApp() {
    const root = document.getElementById('app');
    root.innerHTML = '';

    if (!state.isAuthenticated) {
        renderLogin(root);
    } else if (state.results) {
        renderTimetables(root);
    } else {
        renderDashboard(root);
    }
}

function renderLogin(root) {
    root.innerHTML = `
        <div class="min-h-screen flex items-center justify-center bg-gray-50 p-4">
            <div class="max-w-md w-full bg-slate-900 rounded-xl shadow-2xl overflow-hidden border border-slate-800 p-8 text-center">
                <h2 class="text-3xl font-bold text-white mb-2">AutoScheduler Pro</h2>
                <p class="text-slate-400 mb-6">Web Server Edition</p>
                <form id="loginForm" class="space-y-6">
                    <input type="text" id="username" placeholder="Username" class="block w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white mb-4" required>
                    <input type="password" id="password" placeholder="Password" class="block w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white" required>
                    <button type="submit" class="w-full py-3 bg-brand-600 text-white rounded-lg font-bold hover:bg-brand-700 transition">Sign In</button>
                    <div id="loginError" class="text-red-400 text-sm hidden">Invalid credentials</div>
                </form>

                <div class="mt-4 text-slate-500 text-xs">
                     Default: rishabhsharma / rishabh1234
                </div>
            </div>
        </div>
    `;

    document.getElementById('loginForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const u = document.getElementById('username').value;
        const p = document.getElementById('password').value;
        if (u === 'rishabhsharma' && p === 'rishabh1234') {
            state.isAuthenticated = true;
            state.user = u;
            localStorage.setItem('autoscheduler_user', u);
            // ✅ Start fresh - don't auto-load database
            state.inputs = [createEmptyClass()];
            renderApp();
        } else {
            document.getElementById('loginError').classList.remove('hidden');
        }
    });
}

function renderDashboard(root) {
    if (state.inputs.length === 0) {
        state.inputs.push({ id: Date.now().toString(), name: 'Class 1', subjectsRaw: '', teachersRaw: '', roomsRaw: '' });
    }

    let cardsHtml = state.inputs.map((inp, idx) => `
        <div class="bg-slate-900 border border-slate-700 rounded-lg p-6 shadow-sm mb-6">
            <div class="flex justify-between items-start mb-4">
                <div class="flex-1">
                    <label class="block text-xs font-bold text-slate-400 uppercase mb-1">Class Name</label>
                    <input type="text" value="${inp.name}" oninput="updateInput('${inp.id}', 'name', this.value)" 
                        class="w-full text-lg font-bold text-white bg-transparent border-b-2 border-transparent focus:border-brand-500 outline-none pb-1">
                </div>
                ${state.inputs.length > 1 ? `<button onclick="removeClass('${inp.id}')" class="text-slate-500 hover:text-red-400 ml-4">✕</button>` : ''}
            </div>
            
            <div class="space-y-4">
                <div>
                    <label class="block text-sm font-medium text-slate-300 mb-1">Subjects & Count (e.g. Math:5, English:4)</label>
                    <input type="text" value="${inp.subjectsRaw}" oninput="updateInput('${inp.id}', 'subjectsRaw', this.value)"
                        class="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-white focus:ring-2 focus:ring-brand-500 outline-none">
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-slate-300 mb-1">Teachers (e.g. Math:Mr.A)</label>
                        <input type="text" value="${inp.teachersRaw}" oninput="updateInput('${inp.id}', 'teachersRaw', this.value)"
                            class="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-white focus:ring-2 focus:ring-brand-500 outline-none">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-slate-300 mb-1">Rooms (Optional)</label>
                        <input type="text" value="${inp.roomsRaw}" oninput="updateInput('${inp.id}', 'roomsRaw', this.value)"
                            class="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-white focus:ring-2 focus:ring-brand-500 outline-none">
                    </div>
                </div>
            </div>
        </div>
    `).join('');

    root.innerHTML = `
        <div class="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-800">
            <header class="bg-brand-900 text-white shadow-lg sticky top-0 z-50">
                <div class="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
                    <div class="text-xl font-bold tracking-tight">AutoScheduler <span class="text-brand-400">Pro</span></div>
                    <div class="flex items-center gap-4">
                        <span class="text-sm text-brand-200 hidden md:inline">Welcome, ${state.user}</span>
                        <button onclick="logout()" class="text-sm bg-brand-800 hover:bg-brand-700 px-3 py-1.5 rounded transition">Logout</button>
                    </div>
                </div>
            </header>

            <main class="flex-1 max-w-6xl mx-auto w-full p-4 md:p-8">
                <!-- Toolbar -->
                <div class="flex flex-col md:flex-row justify-between items-end md:items-center gap-4 border-b border-gray-200 pb-6 mb-8">
                    <div>
                        <h1 class="text-3xl font-bold text-gray-900">Setup Classes</h1>
                        <p class="text-gray-500 mt-1">Changes are saved automatically.</p>
                    </div>
                    <div class="flex flex-wrap gap-2 justify-end">
                        <button onclick="importDatabase()" class="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-300 hover:bg-slate-50 rounded transition">
                            📂 Import DB
                        </button>
                        <button onclick="exportDatabase()" class="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-300 hover:bg-slate-50 rounded transition">
                            💾 Export DB
                        </button>
                        <div class="w-px h-8 bg-gray-300 mx-1 hidden md:block"></div>
                        <button onclick="addClass()" class="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded transition">+ Add Class</button>
                    </div>
                </div>

                ${state.error ? `<div class="bg-red-50 border-l-4 border-red-500 p-4 mb-6 text-red-700">${state.error}</div>` : ''}

                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    ${cardsHtml}
                </div>

                <div class="flex justify-center pt-8 pb-20">
                    <button onclick="handleGenerate()" id="genBtn" class="px-8 py-4 rounded-full text-lg font-bold shadow-xl transition transform hover:-translate-y-1 bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-700 hover:to-brand-600 text-white flex items-center gap-2">
                        <span>✨ Generate Timetables</span>
                    </button>
                </div>
            </main>
        </div>
    `;
}

function renderTimetables(root) {
    let tablesHtml = state.results.map(tt => `
        <div class="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden print-break mb-8">
            <div class="bg-brand-600 px-6 py-4 text-white">
                <h3 class="text-xl font-bold">${tt.className}</h3>
                <p class="text-brand-100 text-xs mt-1 uppercase tracking-wider">Weekly Schedule</p>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-sm text-left">
                    <thead class="text-xs text-gray-500 uppercase bg-gray-50 border-b">
                        <tr>
                            <th class="px-4 py-3 font-bold border-r w-24">Day</th>
                            ${Array.from({ length: PERIODS }).map((_, i) => `<th class="px-4 py-3 font-bold border-r text-center">Period ${i + 1}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${tt.grid.map((dayRow, d) => `
                            <tr class="border-b hover:bg-gray-50">
                                <td class="px-4 py-4 font-bold text-gray-900 bg-gray-50 border-r text-center">${DAYS[d].substring(0, 3)}</td>
                                ${dayRow.map(cell => `
                                    <td class="px-2 py-3 border-r align-top h-24 w-1/6">
                                        ${!cell.isFree ? `
                                            <div class="h-full flex flex-col justify-between p-2 rounded bg-blue-50 border border-blue-100">
                                                <span class="font-bold text-brand-900 block mb-1">${cell.subject}</span>
                                                <div class="text-xs text-gray-500">
                                                    <span class="font-medium text-gray-700">${cell.teacher}</span>
                                                    ${cell.room !== 'Homeroom' ? `<div class="text-gray-400">Rm: ${cell.room}</div>` : ''}
                                                </div>
                                            </div>
                                        ` : `
                                            <div class="h-full flex items-center justify-center text-gray-300 text-xs italic">Free</div>
                                        `}
                                    </td>
                                `).join('')}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `).join('');

    root.innerHTML = `
        <div class="min-h-screen bg-slate-50 p-4 md:p-8 font-sans">
            <div class="flex flex-col md:flex-row justify-between items-center bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-8 no-print max-w-6xl mx-auto">
                <h2 class="text-2xl font-bold text-gray-800">Generated Timetables</h2>
                <div class="flex gap-3 mt-4 md:mt-0">
                    <button onclick="state.results = null; renderApp();" class="px-4 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded font-medium">Back to Edit</button>
                    <button onclick="window.print()" class="px-4 py-2 text-sm text-white bg-brand-600 hover:bg-brand-700 rounded font-medium shadow-sm">Print / Save PDF</button>
                    <button onclick="exportDatabase()" class="px-4 py-2 text-sm font-medium text-brand-700 bg-brand-50 hover:bg-brand-100 rounded transition">Export DB</button>
                </div>
            </div>
            <div class="max-w-6xl mx-auto gap-8 grid grid-cols-1">
                ${tablesHtml}
            </div>
        </div>
    `;
}

// --- Actions ---
window.updateInput = (id, field, value) => {
    state.inputs = state.inputs.map(i => i.id === id ? { ...i, [field]: value } : i);
    saveData();
};

window.addClass = () => {
    if (state.inputs.length < MAX_CLASSES) {
        state.inputs.push({
            id: Date.now().toString(),
            name: `Class ${state.inputs.length + 1}`,
            subjectsRaw: '', teachersRaw: '', roomsRaw: ''
        });
        saveData();
        renderApp();
    }
};

window.removeClass = (id) => {
    state.inputs = state.inputs.filter(i => i.id !== id);
    saveData();
    renderApp();
};

window.logout = () => {
    state.isAuthenticated = false;
    state.user = '';
    state.results = null;
    localStorage.removeItem('autoscheduler_user');
    renderApp();
};

window.importDatabase = importDatabase;
window.exportDatabase = exportDatabase;

window.handleGenerate = async () => {
    const btn = document.getElementById('genBtn');
    btn.innerHTML = 'Generating...';
    btn.disabled = true;
    state.error = null;

    setTimeout(() => {
        try {
            const parsedClasses = state.inputs.map(inp => {
                if (!inp.name) throw new Error("All classes must have a name.");
                const subjects = parseConfigString(inp.subjectsRaw);
                if (Object.keys(subjects).length === 0) throw new Error(`Class ${inp.name} has no subjects.`);

                return {
                    id: inp.id,
                    name: inp.name,
                    subjects,
                    teachers: parseConfigString(inp.teachersRaw),
                    rooms: parseConfigString(inp.roomsRaw)
                };
            });
            const timetables = generateTimetables(parsedClasses);
            state.results = timetables;
            renderApp();
        } catch (err) {
            state.error = err.message;
            renderApp();
        }
    }, 100);
};


