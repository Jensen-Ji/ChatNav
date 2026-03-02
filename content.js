(function() {
    const siteConfigs = {
        'gemini.google.com': { userSelector: '.user-query-bubble-with-background', aiSelector: '.model-response-text', prefixToRemove: '你说' },
        'chatgpt.com': { userSelector: '[data-message-author-role="user"]', aiSelector: '[data-message-author-role="assistant"]', prefixToRemove: '' },
        'www.doubao.com': { userSelector: '[data-plugin-identifier="block_type:10000"].justify-end', aiSelector: '[data-plugin-identifier="block_type:10000"].justify-start', prefixToRemove: '' },
        'www.qianwen.com': { userSelector: '.contentBox-t7l7vJ', aiSelector: '.contentBox-S3Nidm', prefixToRemove: '' },
        'www.kimi.com': { 
            userSelector: '.chat-content-item-user .user-content', 
            aiSelector: '.chat-content-item-assistant .markdown, .chat-content-item-assistant .segment-content-box', 
            prefixToRemove: '' 
        },
        'kimi.moonshot.cn': { 
            userSelector: '.chat-content-item-user .user-content', 
            aiSelector: '.chat-content-item-assistant .markdown, .chat-content-item-assistant .segment-content-box', 
            prefixToRemove: '' 
        },

        'yuanbao.tencent.com': { 
            userSelector: '.agent-chat__list__item--human .hyc-content-text', 
            aiSelector: '.agent-chat__speech-text .hyc-common-markdown, .agent-chat__speech-text .hyc-content-md', 
            prefixToRemove: '' 
        },
        'chat.deepseek.com': { 
            userSelector: '.fbb737a4', 
            aiSelector: '.ds-markdown', 
            prefixToRemove: '' 
        }
    };

    const currentHost = window.location.hostname;
    const currentConfig = siteConfigs[currentHost];
    if (!currentConfig) return;

    let pinnedTexts = JSON.parse(localStorage.getItem('chatNavPins') || '[]');
    let activeAnchor = JSON.parse(localStorage.getItem('chatNavSingleAnchor_' + currentHost) || 'null');

    // ==========================================
    // 1. Initialize DOM
    // ==========================================
    let currentWidth = parseInt(localStorage.getItem('chatNavSidebarWidth')) || 220;
    const sidebar = document.createElement('div'); sidebar.id = 'chat-nav-sidebar'; sidebar.style.width = currentWidth + 'px'; document.body.appendChild(sidebar);

    const header = document.createElement('div'); header.id = 'chat-nav-header';
    header.innerHTML = `<h3>ChatNav <span class="header-anchor-btn ${activeAnchor !== null ? 'active' : ''}" title="[m] Mark / ['] Jump">🚩 Mark</span></h3><input id="chat-nav-search-input" type="text" placeholder="Search (Press / to focus)...">`;
    sidebar.appendChild(header);

    const pinnedContainer = document.createElement('div'); pinnedContainer.id = 'chat-nav-pinned-container'; sidebar.appendChild(pinnedContainer);
    const listContainer = document.createElement('div'); listContainer.id = 'chat-nav-list-content'; sidebar.appendChild(listContainer);

    const anchorBtn = header.querySelector('.header-anchor-btn');
    const searchInput = header.querySelector('#chat-nav-search-input');
    const resizer = document.createElement('div'); resizer.id = 'chat-nav-resize-handle'; sidebar.appendChild(resizer);
    const toggleBtn = document.createElement('div'); toggleBtn.id = 'chat-nav-toggle-btn'; toggleBtn.innerText = '▶'; toggleBtn.style.right = currentWidth + 'px'; document.body.appendChild(toggleBtn);

    // ==========================================
    // 2. Core Logic: Single Anchor System
    // ==========================================
    function getScroller() {
        const bubbles = document.querySelectorAll(currentConfig.userSelector);
        if (bubbles.length === 0) return window;
        let el = bubbles[0].parentElement;
        while (el && el !== document.body) {
            const s = window.getComputedStyle(el);
            if ((s.overflowY === 'auto' || s.overflowY === 'scroll') && el.scrollHeight > el.clientHeight) return el;
            el = el.parentElement;
        }
        return window;
    }

    function setAnchor() {
        if (activeAnchor !== null) {
            if (!confirm("An anchor already exists. Overwrite it?")) return;
        }
        const s = getScroller();
        activeAnchor = (s === window) ? window.scrollY : s.scrollTop;
        localStorage.setItem('chatNavSingleAnchor_' + currentHost, JSON.stringify(activeAnchor));
        anchorBtn.classList.add('active');
    }

    function gotoAnchor() {
        if (activeAnchor === null) {
            alert("No anchor set. Press [m] to mark a location first.");
            return;
        }
        const s = getScroller();
        const target = (s === window) ? window : s;
        target.scrollTo({ top: activeAnchor, behavior: 'smooth' });
    }
    anchorBtn.onclick = () => setAnchor();

    // ==========================================
    // 3. Navigation Building
    // ==========================================
    let lastUserCount = 0, lastCodeCount = 0, filterText = '';
    let scrollObserver = null, intersecting = new Map(), anyBubbleToNavMap = new Map();
    let manualLock = false;

    function buildNavigation(force = false) {
        const userBubbles = Array.from(document.querySelectorAll(currentConfig.userSelector));
        const aiBubbles = Array.from(document.querySelectorAll(currentConfig.aiSelector));
        const allPre = Array.from(document.querySelectorAll('pre'));
        if (!force && userBubbles.length === lastUserCount && allPre.length === lastCodeCount) return;
        lastUserCount = userBubbles.length; lastCodeCount = allPre.length;

        const mainFrag = document.createDocumentFragment(), pinFrag = document.createDocumentFragment();
        anyBubbleToNavMap.clear();

        userBubbles.forEach((bubble, index) => {
            const createNode = (isPin) => {
                let text = bubble.innerText.replace(/\n/g, ' ').trim();
                if (currentConfig.prefixToRemove && text.startsWith(currentConfig.prefixToRemove)) text = text.substring(currentConfig.prefixToRemove.length);
                if (filterText && !text.toLowerCase().includes(filterText)) return null;
                const finger = text.substring(0, 50);
                const item = document.createElement('div'); item.className = 'chat-nav-item'; item.setAttribute('data-id', index);
                item.innerHTML = `<span class="nav-item-text">${text.length > 30 ? text.substring(0, 30) + '...' : text}</span>`;
                const btns = document.createElement('div'); btns.className = 'copy-btns-wrapper';
                
                const ai = aiBubbles.find(a => bubble.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING);
                if (ai) ai.querySelectorAll('pre').forEach(pre => {
                    const cBtn = document.createElement('div'); cBtn.className = 'action-btn copy-code-btn';
                    cBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>`;
                    cBtn.onclick = (e) => { e.stopPropagation(); navigator.clipboard.writeText(pre.innerText); cBtn.classList.add('success'); setTimeout(()=>cBtn.classList.remove('success'), 1000); };
                    btns.appendChild(cBtn);
                });

                const pBtn = document.createElement('div');
                pBtn.className = isPin ? 'action-btn unpin-btn' : 'action-btn pin-btn' + (pinnedTexts.includes(finger) ? ' active' : '');
                pBtn.innerHTML = isPin ? '✕' : '📌';
                pBtn.onclick = (e) => {
                    e.stopPropagation();
                    if (pinnedTexts.includes(finger)) pinnedTexts = pinnedTexts.filter(t => t !== finger);
                    else pinnedTexts.push(finger);
                    localStorage.setItem('chatNavPins', JSON.stringify(pinnedTexts)); buildNavigation(true);
                };
                btns.appendChild(pBtn); item.appendChild(btns);
                item.onclick = () => { manualLock = true; bubble.scrollIntoView({ behavior: 'smooth', block: 'center' }); setActiveNavItem(document.querySelector(`#chat-nav-list-content [data-id="${index}"]`) || item); setTimeout(() => manualLock = false, 1000); };
                return { node: item, finger };
            };
            const m = createNode(false);
            if (m) {
                anyBubbleToNavMap.set(bubble, m.node); mainFrag.appendChild(m.node);
                const ai = aiBubbles.find(a => bubble.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING);
                if (ai) anyBubbleToNavMap.set(ai, m.node);
                if (pinnedTexts.includes(m.finger)) { const p = createNode(true); if (p) pinFrag.appendChild(p.node); }
            }
        });

        requestAnimationFrame(() => {
            pinnedContainer.innerHTML = '<div class="nav-section-title">PINNED 📌</div>';
            if (pinFrag.childNodes.length > 0) pinnedContainer.appendChild(pinFrag);
            else pinnedContainer.innerHTML += `<div style="padding:10px 16px; font-size:12px; color:#bdc1c6; font-style:italic;">No pinned items yet</div>`;
            listContainer.innerHTML = '<div class="nav-section-title">ALL CONVERSATIONS 💬</div>';
            listContainer.appendChild(mainFrag);
            refreshScrollSpy();
        });
    }

    // ==========================================
    // 4. Interaction: Vim Keybindings
    // ==========================================
    document.addEventListener('keydown', (e) => {
        const tag = document.activeElement.tagName.toLowerCase();
        const isTyping = tag === 'input' || tag === 'textarea' || document.activeElement.isContentEditable;
        if (e.key === 'Escape') document.activeElement.blur();
        if (e.key === '/' && !isTyping) { e.preventDefault(); if (sidebar.classList.contains('collapsed')) toggleBtn.click(); searchInput.focus(); return; }
        if (isTyping) return;

        const s = getScroller(), step = e.repeat ? 60 : 350, behavior = e.repeat ? 'auto' : 'smooth';
        const scrollEl = (s === window) ? document.documentElement : s;

        switch (e.key) {
            case 'j': s.scrollBy({ top: step, behavior }); break;
            case 'k': s.scrollBy({ top: -step, behavior }); break;
            case 'G': scrollEl.scrollTo({ top: scrollEl.scrollHeight, behavior: 'smooth' }); break;
            case 'g': scrollEl.scrollTo({ top: 0, behavior: 'smooth' }); break;
            case 'm': setAnchor(); break; 
            case "'": gotoAnchor(); break; 
        }
    });

    function setActiveNavItem(mainItem) { if (!mainItem) return; requestAnimationFrame(() => { document.querySelectorAll('.chat-nav-item.active').forEach(el => el.classList.remove('active')); const tid = mainItem.getAttribute('data-id'); if (tid) document.querySelectorAll(`.chat-nav-item[data-id="${tid}"]`).forEach(el => el.classList.add('active')); mainItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }); }
    function isAtBottom() { const s = getScroller(); const r = (s === window) ? (document.documentElement.scrollHeight - window.innerHeight - window.scrollY) : (s.scrollHeight - s.clientHeight - s.scrollTop); return r <= 120; }
    function updateHighlight() {
        if (manualLock || intersecting.size === 0) return;
        if (isAtBottom()) { const b = Array.from(anyBubbleToNavMap.keys()); if (b.length > 0) { const l = b[b.length-1]; if (intersecting.has(l)) { setActiveNavItem(anyBubbleToNavMap.get(l)); return; } } }
        const line = window.innerHeight * 0.25;
        const sorted = Array.from(intersecting.values()).sort((a,b) => Math.abs(a.target.getBoundingClientRect().top - line) - Math.abs(b.target.getBoundingClientRect().top - line));
        setActiveNavItem(anyBubbleToNavMap.get(sorted[0].target));
    }
    window.addEventListener('scroll', updateHighlight, { passive: true });
    function refreshScrollSpy() { if (scrollObserver) scrollObserver.disconnect(); scrollObserver = new IntersectionObserver((entries) => { entries.forEach(e => { if (e.isIntersecting) intersecting.set(e.target, e); else intersecting.delete(e.target); }); updateHighlight(); }, { threshold: [0, 0.1, 0.5, 1], rootMargin: "0px" }); anyBubbleToNavMap.forEach((v, k) => scrollObserver.observe(k)); }

    toggleBtn.onclick = () => { sidebar.classList.toggle('collapsed'); toggleBtn.innerText = sidebar.classList.contains('collapsed') ? '◀' : '▶'; toggleBtn.style.right = sidebar.classList.contains('collapsed') ? '0px' : sidebar.offsetWidth + 'px'; };
    resizer.onmousedown = () => { document.onmousemove = (me) => { let nw = Math.max(150, Math.min(window.innerWidth - me.clientX, window.innerWidth/2)); sidebar.style.width = nw + 'px'; toggleBtn.style.right = nw + 'px'; }; document.onmouseup = () => { document.onmousemove = null; localStorage.setItem('chatNavSidebarWidth', sidebar.offsetWidth); }; };
    searchInput.oninput = (e) => { filterText = e.target.value.toLowerCase(); buildNavigation(true); };
    setTimeout(() => buildNavigation(), 2000);
    new MutationObserver(() => buildNavigation()).observe(document.body, { childList: true, subtree: true });
})();