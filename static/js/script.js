/* ==========================================================================
   AURA APPLICATION ENGINE (SUPABASE REAL-TIME CLOUD DATABASE BACKEND)
   ========================================================================== */

document.addEventListener('DOMContentLoaded', async () => {
    // 1. DYNAMIC API KEY INJECTION FROM VERCEL PRODUCTION ENVIRONMENT WINDOW
    const SUPABASE_URL = window.env?.SUPABASE_URL || "https://pbpcejfmtgnnmuuwhkfi.supabase.co";
    const SUPABASE_KEY = window.env?.SUPABASE_ANON_KEY || "sb_publishable_gXzJwVhAVhWwGHJ6QFwLIA_4eQ2kGtZ";

    // Gracefully initialize routing connection layer client instance
    const supabase = window.supabase?.createClient(SUPABASE_URL, SUPABASE_KEY);

    let currentUser = localStorage.getItem('aura_currentUser');
    const currentPath = window.location.pathname;

    const absoluteTemplates = ['index.html', 'deadlines.html', 'progress.html', 'about.html', 'contact.html', 'profile.html'];
    const isProtectedPage = absoluteTemplates.some(page => currentPath.includes(page)) || currentPath.endsWith('/') || currentPath === '';
    const isAuthPage = currentPath.includes('login.html') || currentPath.includes('signup.html');

    if (!currentUser && isProtectedPage) { window.location.href = 'login.html'; return; }
    if (currentUser && isAuthPage) { window.location.href = 'index.html'; return; }

    // Execute server midnight rollover synchronization engine checks
    if (currentUser && supabase) {
        await checkMidnightRollover(currentUser);
    }

    const userDisplay = document.getElementById('welcome-user');
    if (userDisplay && currentUser) { userDisplay.textContent = `⚡ ${currentUser}`; }

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            await supabase?.auth.signOut();
            localStorage.removeItem('aura_currentUser');
            window.location.href = 'login.html';
        });
    }

    // 2. USER AUTHENTICATION LAYER CONTROLLERS WITH CLOUD QUERIES
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const errorBox = document.getElementById('error-message');
    const successBox = document.getElementById('success-message');

    function showNotice(box, msg) { if (!box) return; box.textContent = msg; box.classList.remove('hidden'); }
    function clearNotices() { if (errorBox) errorBox.classList.add('hidden'); if (successBox) successBox.classList.add('hidden'); }

    if (signupForm && supabase) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault(); clearNotices();
            const email = document.getElementById('new-email').value.trim();
            const username = document.getElementById('new-username').value.trim();
            const pass = document.getElementById('new-password').value;
            const confirmPass = document.getElementById('confirm-password').value;

            if (pass !== confirmPass) { showNotice(errorBox, "Passwords do not match."); return; }
            if (pass.length < 6) { showNotice(errorBox, "Password must be at least 6 characters long."); return; }
            if (!/\d/.test(pass)) { showNotice(errorBox, "Password must contain at least one number."); return; }
            if (!/[A-Z]/.test(pass)) { showNotice(errorBox, "Password must contain at least one uppercase letter."); return; }

            // Register user via Supabase Auth
            const { data, error: authError } = await supabase.auth.signUp({
                email,
                password: pass,
                options: {
                    data: { username: username }
                }
            });

            if (authError) { showNotice(errorBox, authError.message || "Account creation failed."); return; }

            // Initialize default preferences and profile slots cleanly
            await supabase.from('user_preferences').insert([{ username, vacation_mode: false, last_checked_date: new Date().toDateString() }]);
            await supabase.from('user_profiles').insert([{ username, full_name: '', institution: '', bio: '' }]);

            showNotice(successBox, "Account registered successfully! Check email for confirmation if required, or log in.");
            setTimeout(() => window.location.href = 'login.html', 1500);
        });
    }

    if (loginForm && supabase) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault(); clearNotices();
            const email = document.getElementById('email').value.trim();
            const pass = document.getElementById('password').value;

            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password: pass
            });

            if (error || !data.user) { showNotice(errorBox, "Invalid email or password credentials."); return; }

            const loggedInUsername = data.user.user_metadata?.username || email.split('@')[0];
            localStorage.setItem('aura_currentUser', loggedInUsername);
            window.location.href = 'index.html';
        });
    }

    // 3. MIDNIGHT LIFECYCLE CONTROLLER (ATOMIC SERVER TRANSACTIONS)
    async function checkMidnightRollover(user) {
        const todayStr = new Date().toDateString();
        
        let { data: prefs } = await supabase.from('user_preferences').select('*').eq('username', user).maybeSingle();
        if (!prefs) {
            await supabase.from('user_preferences').insert([{ username: user, vacation_mode: false, last_checked_date: todayStr }]);
            return;
        }

        if (prefs.last_checked_date !== todayStr) {
            if (prefs.vacation_mode) {
                await supabase.from('user_preferences').update({ last_checked_date: todayStr }).eq('username', user);
                return;
            }

            // Fetch live components to compute performance score parameters
            let { data: liveTasks } = await supabase.from('tasks').select('*').eq('username', user);
            liveTasks = liveTasks || [];

            let dailies = liveTasks.filter(t => t.category === 'daily');
            let habits = liveTasks.filter(t => t.category === 'habit');
            let dailyScore = dailies.length > 0 ? Math.round((dailies.filter(t => t.status === 'completed').length / dailies.length) * 100) : 0;
            let hobbyScore = habits.length > 0 ? Math.round((habits.filter(t => t.status === 'completed').length / habits.length) * 100) : 0;

            const prevDateObj = new Date(prefs.last_checked_date);
            const daysOfWeek = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
            const graphLabel = daysOfWeek[prevDateObj.getDay()];

            // Log macro tracking stats snapshot row entry
            await supabase.from('macro_history').insert([{ username: user, date_string: graphLabel, timestamp_id: prevDateObj.getTime(), daily_score: dailyScore, hobby_score: hobbyScore }]);

            // Compile granular individual task items hit map log rows
            const itemLogs = liveTasks.filter(t => t.category !== 'deadline').map(task => ({
                username: user, text: task.text, category: task.category, date_string: graphLabel, timestamp_id: prevDateObj.getTime(), status: task.status === 'completed' ? 1 : 0
            }));
            if (itemLogs.length > 0) { await supabase.from('item_history').insert(itemLogs); }

            // Reset daily targets & reset pending states cleanly via cloud targets
            // 1. Clear daily tasks
            await supabase.from('tasks').delete().eq('username', user).eq('category', 'daily');

            // 2. Reset streak of uncompleted habits/hobbies to 0
            await supabase.from('tasks').update({ streak: 0 }).eq('username', user).eq('category', 'habit').eq('status', 'pending');

            // 3. Reset completed habits/hobbies to pending status (keeping their streak)
            await supabase.from('tasks').update({ status: 'pending' }).eq('username', user).eq('category', 'habit').eq('status', 'completed');

            await supabase.from('user_preferences').update({ last_checked_date: todayStr }).eq('username', user);
        }
    }

    // 4. CENTRAL TASK LOGIC ENGINE (LIVE CLOUD DECOUPLING ENGINE)
    const taskForm = document.getElementById('task-form');
    const deadlineForm = document.getElementById('deadline-form');

    async function saveTask(text, category, dueDate = null) {
        const id = Date.now();
        await supabase.from('tasks').insert([{ id, username: currentUser, text, category, due_date: dueDate, status: 'pending', streak: 0 }]);
        await renderDashboard();
    }

    window.toggleTaskStatus = async function(id, currentCategory, currentStatus, currentStreak) {
        let newStatus = currentStatus === 'completed' ? 'pending' : 'completed';
        let newStreak = currentStreak || 0;

        if (currentCategory === 'habit') {
            newStreak = newStatus === 'completed' ? newStreak + 1 : Math.max(0, newStreak - 1);
        }

        await supabase.from('tasks').update({ status: newStatus, streak: newStreak }).eq('id', id);
        await renderDashboard();
    };

    window.deleteTask = async function(id) {
        await supabase.from('tasks').delete().eq('id', id);
        await renderDashboard();
    };

    if (taskForm) {
        taskForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const text = document.getElementById('task-input').value.trim();
            const category = document.getElementById('category-select').value;
            await saveTask(text, category);
            taskForm.reset();
        });
    }

    if (deadlineForm) {
        deadlineForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const text = document.getElementById('deadline-input').value.trim();
            const dueDate = document.getElementById('due-date-input').value;
            await saveTask(text, 'deadline', dueDate);
            deadlineForm.reset();
        });
    }

    function getStreakClassAndSymbol(streak) {
        const count = streak || 0;
        if (count === 0) return { cssClass: 'streak-level-0', symbol: '⚡' };
        if (count <= 2) return { cssClass: 'streak-level-low', symbol: '⚡' };
        if (count <= 5) return { cssClass: 'streak-level-mid', symbol: '🔥' };
        return { cssClass: 'streak-level-high', symbol: '☄️' };
    }

    // 5. ASYNC DASHBOARD INTERFACE RENDERING PIPELINE
    async function renderDashboard() {
        if (!supabase || !currentUser) return;

        const dailyContainer = document.getElementById('daily-tasks-container');
        const habitContainer = document.getElementById('habit-tasks-container');
        const deadlineContainer = document.getElementById('deadline-tasks-container');

        if (dailyContainer) dailyContainer.innerHTML = '';
        if (habitContainer) habitContainer.innerHTML = '';
        if (deadlineContainer) deadlineContainer.innerHTML = '';

        // Render Method: Profile Page Metadata Resolution (profile.html)
        if (currentPath.includes('profile.html')) {
            const bioForm = document.getElementById('profile-bio-form');
            const fullNameInput = document.getElementById('profile-fullname');
            const institutionInput = document.getElementById('profile-institution');
            const bioInput = document.getElementById('profile-bio');
            
            const statUsername = document.getElementById('stat-username');
            const statTotalTasks = document.getElementById('stat-total-tasks');
            const successBox = document.getElementById('profile-success');

            if (statUsername) statUsername.textContent = currentUser;

            let { data: tasksList } = await supabase.from('tasks').select('id').eq('username', currentUser);
            if (statTotalTasks && tasksList) statTotalTasks.textContent = tasksList.length;

            let { data: profile } = await supabase.from('user_profiles').select('*').eq('username', currentUser).maybeSingle();
            if (profile) {
                if (fullNameInput) fullNameInput.value = profile.full_name || '';
                if (institutionInput) institutionInput.value = profile.institution || '';
                if (bioInput) bioInput.value = profile.bio || '';
            }

            if (bioForm) {
                bioForm.replaceWith(bioForm.cloneNode(true)); // Prevent multiple dynamic event listeners
                const cleanBioForm = document.getElementById('profile-bio-form');
                cleanBioForm.addEventListener('submit', async (submitEvent) => {
                    submitEvent.preventDefault();
                    const updatedFields = {
                        full_name: document.getElementById('profile-fullname').value.trim(),
                        institution: document.getElementById('profile-institution').value.trim(),
                        bio: document.getElementById('profile-bio').value.trim()
                    };
                    const { error } = await supabase
                        .from('user_profiles')
                        .upsert({ username: currentUser, ...updatedFields }, { onConflict: 'username' });
                    
                    const activeSuccessBox = document.getElementById('profile-success');
                    if (!error && activeSuccessBox) {
                        activeSuccessBox.classList.remove('hidden');
                        setTimeout(() => activeSuccessBox.classList.add('hidden'), 3000);
                    }
                });
            }
            return;
        }

        // Render Method: Performance Chart Generation (progress.html)
        if (currentPath.includes('progress.html')) {
            let { data: userHistory } = await supabase.from('macro_history').select('*').eq('username', currentUser);
            userHistory = userHistory || [];
            userHistory.sort((a,b) => a.timestamp_id - b.timestamp_id);
            let targetPlotData = userHistory.slice(-7);

            if (targetPlotData.length === 0) {
                targetPlotData = [
                    { date_string: 'MON', daily_score: 0, hobby_score: 0 }, { date_string: 'TUE', daily_score: 0, hobby_score: 0 },
                    { date_string: 'WED', daily_score: 0, hobby_score: 0 }, { date_string: 'THU', daily_score: 0, hobby_score: 0 },
                    { date_string: 'FRI', daily_score: 0, hobby_score: 0 }, { date_string: 'SAT', daily_score: 0, hobby_score: 0 },
                    { date_string: 'SUN', daily_score: 0, hobby_score: 0 }
                ];
            }

            const dailyChartBox = document.getElementById('daily-bar-chart');
            const hobbyChartBox = document.getElementById('hobby-bar-chart');
            if (dailyChartBox) dailyChartBox.innerHTML = '';
            if (hobbyChartBox) hobbyChartBox.innerHTML = '';

            targetPlotData.forEach(day => {
                if (dailyChartBox) {
                    dailyChartBox.innerHTML += `
                        <div class="chart-bar-wrapper">
                            <div class="bar-track"><div class="bar-fill" style="height: ${day.daily_score}%"><span class="bar-value">${day.daily_score}%</span></div></div>
                            <span class="bar-label">${day.date_string}</span>
                        </div>`;
                }
                if (hobbyChartBox) {
                    hobbyChartBox.innerHTML += `
                        <div class="chart-bar-wrapper">
                            <div class="bar-track"><div class="bar-fill" style="height: ${day.hobby_score}%"><span class="bar-value">${day.hobby_score}%</span></div></div>
                            <span class="bar-label">${day.date_string}</span>
                        </div>`;
                }
            });

            const individualContainer = document.getElementById('individual-tracks-container');
            if (individualContainer) {
                let { data: userItemHistory } = await supabase.from('item_history').select('*').eq('username', currentUser);
                userItemHistory = userItemHistory || [];

                let groupedTasks = {};
                userItemHistory.forEach(log => {
                    if (!groupedTasks[log.text]) { groupedTasks[log.text] = { category: log.category, logs: [] }; }
                    groupedTasks[log.text].logs.push(log);
                });

                const weekLabels = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
                let finalHTML = '';

                if (Object.keys(groupedTasks).length === 0) {
                    finalHTML = `<p class="empty-state">No individual item history tracked yet. Keep logging daily data!</p>`;
                } else {
                    for (let title in groupedTasks) {
                        let taskData = groupedTasks[title];
                        let typeTag = taskData.category === 'daily' ? '<span class="task-type-tag type-daily-tag">☀️ Daily Task</span>' : '<span class="task-type-tag type-habit-tag">🧘 Habit/Hobby</span>';
                        let pillsHTML = '';
                        weekLabels.forEach(day => {
                            let match = [...taskData.logs].reverse().find(l => l.date_string === day);
                            if (match) {
                                pillsHTML += `<div class="history-pill ${match.status === 1 ? (taskData.category === 'daily' ? 'pill-hit-daily' : 'pill-hit-habit') : 'pill-miss'}">${day[0]}</div>`;
                            } else { pillsHTML += `<div class="history-pill pill-miss">-</div>`; }
                        });
                        finalHTML += `
                            <div class="task-stability-row">
                                <div class="task-info-side"><span class="task-title-text">${title}</span>${typeTag}</div>
                                <div class="history-pills-side">${pillsHTML}</div>
                            </div>`;
                    }
                }
                individualContainer.innerHTML = finalHTML;
            }
            return;
        }

        // Fetch user records from live database
        let { data: tasksList } = await supabase.from('tasks').select('*').eq('username', currentUser);
        tasksList = tasksList || [];

        let dailyCount = 0, habitCount = 0, deadlineCount = 0, completedCount = 0;

        // Render Method: Deadlines Component UI List
        if (currentPath.includes('deadlines.html') && deadlineContainer) {
            const deadlineTasks = tasksList.filter(t => t.category === 'deadline');
            deadlineTasks.sort((a,b) => new Date(a.due_date) - new Date(b.due_date));
            
            if(deadlineTasks.length === 0) {
                deadlineContainer.innerHTML = `<p class="empty-state">No upcoming deadlines detected.</p>`;
            } else {
                deadlineTasks.forEach(t => {
                    deadlineCount++;
                    const isCompleted = t.status === 'completed';
                    const daysLeft = Math.ceil((new Date(t.due_date) - new Date()) / (1000 * 60 * 60 * 24));
                    let badgeClass = 'badge-green', badgeText = `${daysLeft} days left`;
                    if (daysLeft <= 0) { badgeClass = 'badge-red'; badgeText = 'Overdue/Due Today'; }
                    else if (daysLeft === 1) { badgeClass = 'badge-orange'; badgeText = 'Due Tomorrow'; }

                    deadlineContainer.innerHTML += `
                        <div class="task-item ${isCompleted ? 'completed' : 'deadline-' + badgeClass}">
                            <div class="task-left-zone">
                                <input type="checkbox" ${isCompleted ? 'checked' : ''} onclick="toggleTaskStatus(${t.id}, '${t.category}', '${t.status}', ${t.streak})">
                                <span>${t.text}</span>
                                <span class="badge ${badgeClass}">${badgeText} (${t.due_date})</span>
                            </div>
                            <button class="delete-task-btn" onclick="deleteTask(${t.id})">🗑️</button>
                        </div>`;
                });
            }
            document.getElementById('deadline-count').textContent = deadlineCount;
            return; 
        }

        // Render Method: Workspace Grind/Habit Tracking lists
        if (currentPath.includes('index.html') || currentPath.endsWith('/') || currentPath === '') {
            const workspaceTasks = tasksList.filter(t => t.category !== 'deadline');
            let currentDailyItems = workspaceTasks.filter(t => t.category === 'daily');
            let currentHabitItems = workspaceTasks.filter(t => t.category === 'habit');

            if(currentDailyItems.length === 0 && dailyContainer) dailyContainer.innerHTML = `<p class="empty-state">No daily tasks added yet.</p>`;
            if(currentHabitItems.length === 0 && habitContainer) habitContainer.innerHTML = `<p class="empty-state">No habits tracked today.</p>`;

            workspaceTasks.forEach(t => {
                const isCompleted = t.status === 'completed';
                if (isCompleted) completedCount++;

                let streakHTML = '';
                if (t.category === 'habit') {
                    const heatData = getStreakClassAndSymbol(t.streak);
                    streakHTML = `<span class="streak-badge ${heatData.cssClass}">${heatData.symbol} ${t.streak || 0}d</span>`;
                }

                const htmlCard = `
                    <div class="task-item ${t.category} ${isCompleted ? 'completed' : ''}">
                        <div class="task-left-zone">
                            <input type="checkbox" ${isCompleted ? 'checked' : ''} onclick="toggleTaskStatus(${t.id}, '${t.category}', '${t.status}', ${t.streak})">
                            <span>${t.text}</span>
                            ${streakHTML}
                        </div>
                        <div class="task-right-zone">
                            <button class="delete-task-btn" onclick="deleteTask(${t.id})">🗑️</button>
                        </div>
                    </div>`;

                if (t.category === 'daily' && dailyContainer) { dailyCount++; dailyContainer.innerHTML += htmlCard; }
                if (t.category === 'habit' && habitContainer) { habitCount++; habitContainer.innerHTML += htmlCard; }
            });

            if(document.getElementById('daily-count')) document.getElementById('daily-count').textContent = dailyCount;
            if(document.getElementById('habit-count')) document.getElementById('habit-count').textContent = habitCount;

            const totalWorkspace = dailyCount + habitCount;
            const percentage = totalWorkspace > 0 ? Math.round((completedCount / totalWorkspace) * 100) : 0;
            if(document.getElementById('workspace-progress-fill')) document.getElementById('workspace-progress-fill').style.width = `${percentage}%`;
            if(document.getElementById('progress-percentage')) document.getElementById('progress-percentage').textContent = `${percentage}%`;
            
            const vacationCheckbox = document.getElementById('vacation-mode-toggle');
            if (vacationCheckbox) {
                let { data: livePrefs } = await supabase.from('user_preferences').select('vacation_mode').eq('username', currentUser).maybeSingle();
                vacationCheckbox.checked = livePrefs?.vacation_mode || false;
            }
        }
    }

    // VACATION COMPONENT EVENT LISTENERS
    const vacationCheckbox = document.getElementById('vacation-mode-toggle');
    if (vacationCheckbox) {
        vacationCheckbox.addEventListener('change', async (e) => {
            await supabase.from('user_preferences').update({ vacation_mode: e.target.checked }).eq('username', currentUser);
        });
    }

    // COMPLIANT METRIC EXCEL CSV REPORT PIPELINE
    const csvBtn = document.getElementById('export-csv-btn');
    if (csvBtn && currentPath.includes('progress.html')) {
        csvBtn.addEventListener('click', async () => {
            let { data: userHistory } = await supabase.from('macro_history').select('*').eq('username', currentUser);
            let { data: userItemHistory } = await supabase.from('item_history').select('*').eq('username', currentUser);
            userHistory = userHistory || []; userItemHistory = userItemHistory || [];

            let csvRows = ["--- MACRO SECTOR OVERVIEW ---", "Date Logged,Timestamp,Daily Tasks Score,Hobby Consistency"];
            userHistory.forEach(h => csvRows.push(`${h.date_string},${h.timestamp_id},${h.daily_score}%,${h.hobby_score}%`));
            csvRows.push("", "--- GRANULAR ITEM SECTOR LOGS ---", "Task or Hobby Title,Category,Weekday,Execution Status");
            userItemHistory.forEach(i => csvRows.push(`"${i.text.replace(/"/g, '""')}",${i.category},${i.date_string},${i.status === 1 ? "COMPLETED" : "MISSED"}`));

            let blob = new Blob([csvRows.join("\n")], { type: 'text/csv;charset=utf-8;' });
            let downloadLink = document.createElement("a");
            downloadLink.href = URL.createObjectURL(blob);
            downloadLink.setAttribute("download", `aura_performance_report.csv`);
            document.body.appendChild(downloadLink); downloadLink.click(); document.body.removeChild(downloadLink);
        });
    }

    const contactForm = document.getElementById('contact-form');
    if (contactForm && supabase) {
        contactForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const name = document.getElementById('contact-name').value.trim();
            const email = document.getElementById('contact-email').value.trim();
            const message = document.getElementById('contact-message').value.trim();
            const successBox = document.getElementById('contact-success');
            const errorBox = document.getElementById('error-message'); // Fallback notice if any

            // Insert form inputs into your live Postgres table
            const { error } = await supabase
                .from('developer_messages')
                .insert([{ name, email, message }]);

            if (!error) {
                if (successBox) {
                    successBox.classList.remove('hidden');
                    setTimeout(() => successBox.classList.add('hidden'), 3000);
                }
                contactForm.reset();
            } else {
                console.error("Failed to stream message:", error.message);
                if (errorBox) {
                    errorBox.textContent = "Failed to send message.";
                    errorBox.classList.remove('hidden');
                }
            }
        });
    }

    const dateBanner = document.getElementById('live-date');
    if (dateBanner) {
        dateBanner.textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
    }

    await renderDashboard();
});