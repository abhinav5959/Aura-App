/* ==========================================================================
   AURA APPLICATION ENGINE (UNIVERSAL JAVASCRIPT)
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    // 1. SESSION ROUTING, MIDNIGHT TRACKING AND STATE MANAGEMENT
    let currentUser = localStorage.getItem('aura_currentUser');
    const currentPath = window.location.pathname;

    const absoluteTemplates = ['index.html', 'deadlines.html', 'progress.html', 'about.html', 'contact.html'];
    const isProtectedPage = absoluteTemplates.some(page => currentPath.includes(page)) || currentPath.endsWith('/') || currentPath === '';
    const isAuthPage = currentPath.includes('login.html') || currentPath.includes('signup.html');

    if (!currentUser && isProtectedPage) {
        window.location.href = 'login.html';
        return;
    }
    if (currentUser && isAuthPage) {
        window.location.href = 'index.html';
        return;
    }

    if (currentUser) {
        checkMidnightRollover(currentUser);
    }

    const userDisplay = document.getElementById('welcome-user');
    if (userDisplay && currentUser) {
        userDisplay.textContent = `⚡ ${currentUser}`;
    }

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('aura_currentUser');
            window.location.href = 'login.html';
        });
    }

    // 2. USER AUTHENTICATION CONTROLLERS
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const errorBox = document.getElementById('error-message');
    const successBox = document.getElementById('success-message');

    function showNotice(box, msg) {
        if (!box) return;
        box.textContent = msg;
        box.classList.remove('hidden');
    }

    function clearNotices() {
        if (errorBox) errorBox.classList.add('hidden');
        if (successBox) successBox.classList.add('hidden');
    }

    if (signupForm) {
        signupForm.addEventListener('submit', (e) => {
            e.preventDefault();
            clearNotices();
            const username = document.getElementById('new-username').value.trim();
            const pass = document.getElementById('new-password').value;
            const confirmPass = document.getElementById('confirm-password').value;

            if (pass !== confirmPass) { showNotice(errorBox, "Passwords do not match."); return; }
            if (pass.length < 6) { showNotice(errorBox, "Password must be at least 6 characters long."); return; }
            if (!/\d/.test(pass)) { showNotice(errorBox, "Password must contain at least one number."); return; }
            if (!/[A-Z]/.test(pass)) { showNotice(errorBox, "Password must contain at least one uppercase letter."); return; }

            let users = JSON.parse(localStorage.getItem('aura_users')) || [];
            if (users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
                showNotice(errorBox, "Username already registered.");
                return;
            }

            users.push({ username, password: pass });
            localStorage.setItem('aura_users', JSON.stringify(users));
            showNotice(successBox, "Account registered successfully! Redirecting...");
            setTimeout(() => window.location.href = 'login.html', 1500);
        });
    }

    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            clearNotices();
            const username = document.getElementById('username').value.trim();
            const pass = document.getElementById('password').value;

            let users = JSON.parse(localStorage.getItem('aura_users')) || [];
            const userMatch = users.find(u => u.username.toLowerCase() === username.toLowerCase() && u.password === pass);

            if (!userMatch) { showNotice(errorBox, "Invalid username or password credentials."); return; }

            localStorage.setItem('aura_currentUser', username);
            if(!localStorage.getItem(`aura_${username}_lastDate`)) {
                localStorage.setItem(`aura_${username}_lastDate`, new Date().toDateString());
            }
            window.location.href = 'index.html';
        });
    }

    // 3. MIDNIGHT LIFECYCLE CONTROLLER (HARD RESET & INDIVIDUAL METRIC HISTORY)
    function checkMidnightRollover(user) {
        const todayStr = new Date().toDateString();
        const lastDateStr = localStorage.getItem(`aura_${user}_lastDate`);

        if (lastDateStr && lastDateStr !== todayStr) {
            let allTasks = JSON.parse(localStorage.getItem('aura_tasks')) || [];
            let userTasks = allTasks.filter(t => t.username === user);

            let dailies = userTasks.filter(t => t.category === 'daily');
            let habits = userTasks.filter(t => t.category === 'habit');

            let dailyScore = dailies.length > 0 ? Math.round((dailies.filter(t => t.status === 'completed').length / dailies.length) * 100) : 0;
            let hobbyScore = habits.length > 0 ? Math.round((habits.filter(t => t.status === 'completed').length / habits.length) * 100) : 0;

            const prevDateObj = new Date(lastDateStr);
            const daysOfWeek = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
            const graphLabel = daysOfWeek[prevDateObj.getDay()];

            // Global Snapshot Commit
            let history = JSON.parse(localStorage.getItem('aura_history')) || [];
            history.push({ username: user, dateString: graphLabel, timestamp: prevDateObj.getTime(), dailyScore, hobbyScore });
            localStorage.setItem('aura_history', JSON.stringify(history));

            // NEW: Log Granular Per-Task Performance Logs
            let itemHistory = JSON.parse(localStorage.getItem('aura_item_history')) || [];
            userTasks.forEach(task => {
                if (task.category !== 'deadline') {
                    itemHistory.push({
                        username: user,
                        text: task.text,
                        category: task.category,
                        dateString: graphLabel,
                        timestamp: prevDateObj.getTime(),
                        status: task.status === 'completed' ? 1 : 0
                    });
                }
            });
            localStorage.setItem('aura_item_history', JSON.stringify(itemHistory));

            // Run Hard Reset
            allTasks = allTasks.filter(t => !(t.username === user && t.category === 'daily'));
            allTasks = allTasks.map(t => {
                if (t.username === user && t.category === 'habit') t.status = 'pending';
                return t;
            });
            localStorage.setItem('aura_tasks', JSON.stringify(allTasks));
        }
        localStorage.setItem(`aura_${user}_lastDate`, todayStr);
    }

    // 4. CENTRAL TASK LOGIC ENGINE
    const taskForm = document.getElementById('task-form');
    const deadlineForm = document.getElementById('deadline-form');

    function getTasks() {
        let allTasks = JSON.parse(localStorage.getItem('aura_tasks')) || [];
        return allTasks.filter(t => t.username === currentUser);
    }

    function saveTask(taskObj) {
        let allTasks = JSON.parse(localStorage.getItem('aura_tasks')) || [];
        allTasks.push(taskObj);
        localStorage.setItem('aura_tasks', JSON.stringify(allTasks));
        renderDashboard();
    }

    window.toggleTaskStatus = function(id) {
        let allTasks = JSON.parse(localStorage.getItem('aura_tasks')) || [];
        allTasks = allTasks.map(t => {
            if (t.id === id && t.username === currentUser) {
                t.status = (t.status === 'completed') ? 'pending' : 'completed';
                if (t.category === 'habit') {
                    if (t.status === 'completed') t.streak += 1;
                    else t.streak = Math.max(0, (t.streak || 0) - 1);
                }
            }
            return t;
        });
        localStorage.setItem('aura_tasks', JSON.stringify(allTasks));
        renderDashboard();
    };

    window.deleteTask = function(id) {
        let allTasks = JSON.parse(localStorage.getItem('aura_tasks')) || [];
        allTasks = allTasks.filter(t => !(t.id === id && t.username === currentUser));
        localStorage.setItem('aura_tasks', JSON.stringify(allTasks));
        renderDashboard();
    };

    if (taskForm) {
        taskForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const text = document.getElementById('task-input').value.trim();
            const category = document.getElementById('category-select').value;
            saveTask({ id: Date.now(), username: currentUser, text, category, dueDate: null, status: 'pending', streak: 0 });
            taskForm.reset();
        });
    }

    if (deadlineForm) {
        deadlineForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const text = document.getElementById('deadline-input').value.trim();
            const dueDate = document.getElementById('due-date-input').value;
            saveTask({ id: Date.now(), username: currentUser, text, category: 'deadline', dueDate, status: 'pending', streak: 0 });
            deadlineForm.reset();
        });
    }

    // 5. DATA ENGINE RENDERING PIPELINE
    function renderDashboard() {
        const tasks = getTasks();

        const dailyContainer = document.getElementById('daily-tasks-container');
        const habitContainer = document.getElementById('habit-tasks-container');
        const deadlineContainer = document.getElementById('deadline-tasks-container');

        let dailyCount = 0, habitCount = 0, deadlineCount = 0, completedCount = 0;

        if (dailyContainer) dailyContainer.innerHTML = '';
        if (habitContainer) habitContainer.innerHTML = '';
        if (deadlineContainer) deadlineContainer.innerHTML = '';

        // Render Method: Analytics System Rendering (progress.html)
        if (currentPath.includes('progress.html')) {
            let history = JSON.parse(localStorage.getItem('aura_history')) || [];
            let userHistory = history.filter(h => h.username === currentUser);

            userHistory.sort((a,b) => a.timestamp - b.timestamp);
            let targetPlotData = userHistory.slice(-7);

            if (targetPlotData.length === 0) {
                targetPlotData = [
                    { dateString: 'MON', dailyScore: 0, hobbyScore: 0 },
                    { dateString: 'TUE', dailyScore: 0, hobbyScore: 0 },
                    { dateString: 'WED', dailyScore: 0, hobbyScore: 0 },
                    { dateString: 'THU', dailyScore: 0, hobbyScore: 0 },
                    { dateString: 'FRI', dailyScore: 0, hobbyScore: 0 },
                    { dateString: 'SAT', dailyScore: 0, hobbyScore: 0 },
                    { dateString: 'SUN', dailyScore: 0, hobbyScore: 0 }
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
                            <div class="bar-track">
                                <div class="bar-fill" style="height: ${day.dailyScore}%">
                                    <span class="bar-value">${day.dailyScore}%</span>
                                </div>
                            </div>
                            <span class="bar-label">${day.dateString}</span>
                        </div>`;
                }
                if (hobbyChartBox) {
                    hobbyChartBox.innerHTML += `
                        <div class="chart-bar-wrapper">
                            <div class="bar-track">
                                <div class="bar-fill" style="height: ${day.hobbyScore}%">
                                    <span class="bar-value">${day.hobbyScore}%</span>
                                </div>
                            </div>
                            <span class="bar-label">${day.dateString}</span>
                        </div>`;
                }
            });

            // NEW: Individual Task Consistency Renderer
            const individualContainer = document.getElementById('individual-tracks-container');
            if (individualContainer) {
                let itemHistory = JSON.parse(localStorage.getItem('aura_item_history')) || [];
                let userItemHistory = itemHistory.filter(h => h.username === currentUser);

                let groupedTasks = {};
                userItemHistory.forEach(log => {
                    if (!groupedTasks[log.text]) {
                        groupedTasks[log.text] = { category: log.category, logs: [] };
                    }
                    groupedTasks[log.text].logs.push(log);
                });

                const weekLabels = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
                let finalHTML = '';

                if (Object.keys(groupedTasks).length === 0) {
                    finalHTML = `<p class="empty-state">No individual item history tracked yet. Keep logging daily data!</p>`;
                } else {
                    for (let title in groupedTasks) {
                        let taskData = groupedTasks[title];
                        let typeTag = taskData.category === 'daily' ? 
                            '<span class="task-type-tag type-daily-tag">☀️ Daily Task</span>' : 
                            '<span class="task-type-tag type-habit-tag">🧘 Habit/Hobby</span>';
                        
                        let pillsHTML = '';
                        weekLabels.forEach(day => {
                            let match = [...taskData.logs].reverse().find(l => l.dateString === day);
                            if (match) {
                                if (match.status === 1) {
                                    pillsHTML += `<div class="history-pill ${taskData.category === 'daily' ? 'pill-hit-daily' : 'pill-hit-habit'}">${day[0]}</div>`;
                                } else {
                                    pillsHTML += `<div class="history-pill pill-miss">${day[0]}</div>`;
                                }
                            } else {
                                pillsHTML += `<div class="history-pill pill-miss">-</div>`;
                            }
                        });

                        finalHTML += `
                            <div class="task-stability-row">
                                <div class="task-info-side">
                                    <span class="task-title-text">${title}</span>
                                    ${typeTag}
                                </div>
                                <div class="history-pills-side">
                                    ${pillsHTML}
                                </div>
                            </div>`;
                    }
                }
                individualContainer.innerHTML = finalHTML;
            }
            return;
        }

        // Render Method: Deadlines System UI
        if (currentPath.includes('deadlines.html') && deadlineContainer) {
            const deadlineTasks = tasks.filter(t => t.category === 'deadline');
            deadlineTasks.sort((a,b) => new Date(a.dueDate) - new Date(b.dueDate));
            
            if(deadlineTasks.length === 0) {
                deadlineContainer.innerHTML = `<p class="empty-state">No upcoming deadlines detected.</p>`;
            } else {
                deadlineTasks.forEach(t => {
                    deadlineCount++;
                    const isCompleted = t.status === 'completed';
                    const daysLeft = Math.ceil((new Date(t.dueDate) - new Date()) / (1000 * 60 * 60 * 24));
                    let badgeClass = 'badge-green', badgeText = `${daysLeft} days left`;
                    if (daysLeft <= 0) { badgeClass = 'badge-red'; badgeText = 'Overdue/Due Today'; }
                    else if (daysLeft === 1) { badgeClass = 'badge-orange'; badgeText = 'Due Tomorrow'; }

                    deadlineContainer.innerHTML += `
                        <div class="task-item ${isCompleted ? 'completed' : 'deadline-' + badgeClass}">
                            <div class="task-left-zone">
                                <input type="checkbox" ${isCompleted ? 'checked' : ''} onclick="toggleTaskStatus(${t.id})">
                                <span>${t.text}</span>
                                <span class="badge ${badgeClass}">${badgeText} (${t.dueDate})</span>
                            </div>
                            <button class="delete-task-btn" onclick="deleteTask(${t.id})">🗑️</button>
                        </div>`;
                });
            }
            document.getElementById('deadline-count').textContent = deadlineCount;
            return; 
        }

        // Render Method: Base Workspace Home UI
        if (currentPath.includes('index.html') || currentPath.endsWith('/') || currentPath === '') {
            const workspaceTasks = tasks.filter(t => t.category !== 'deadline');
            let currentDailyItems = workspaceTasks.filter(t => t.category === 'daily');
            let currentHabitItems = workspaceTasks.filter(t => t.category === 'habit');

            if(currentDailyItems.length === 0 && dailyContainer) dailyContainer.innerHTML = `<p class="empty-state">No daily tasks added yet.</p>`;
            if(currentHabitItems.length === 0 && habitContainer) habitContainer.innerHTML = `<p class="empty-state">No habits tracked today.</p>`;

            workspaceTasks.forEach(t => {
                const isCompleted = t.status === 'completed';
                if (isCompleted) completedCount++;

                const htmlCard = `
                    <div class="task-item ${t.category} ${isCompleted ? 'completed' : ''}">
                        <div class="task-left-zone">
                            <input type="checkbox" ${isCompleted ? 'checked' : ''} onclick="toggleTaskStatus(${t.id})">
                            <span>${t.text}</span>
                        </div>
                        <div class="task-right-zone">
                            ${t.category === 'habit' ? `<span class="streak-badge">🔥 ${t.streak}d</span>` : ''}
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
        }
    }

    const contactForm = document.getElementById('contact-form');
    if (contactForm) {
        contactForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const successBox = document.getElementById('contact-success');
            if (successBox) {
                successBox.classList.remove('hidden');
                setTimeout(() => successBox.classList.add('hidden'), 3000);
            }
            contactForm.reset();
        });
    }

    const dateBanner = document.getElementById('live-date');
    if (dateBanner) {
        dateBanner.textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
    }

    renderDashboard();
});