
(() => {
  'use strict';

  /* -------------------------
     Helpers & small UI pieces
  --------------------------*/
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from((ctx || document).querySelectorAll(sel));

  function createToast() {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      Object.assign(container.style, {
        position: 'fixed',
        right: '18px',
        top: '18px',
        zIndex: 11000,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        alignItems: 'flex-end',
        pointerEvents: 'none'
      });
      document.body.appendChild(container);
    }
    return container;
  }

  function toast(message, opts = {}) {
    const container = createToast();
    const el = document.createElement('div');
    el.className = 'anivio-toast';
    el.textContent = message;
    Object.assign(el.style, {
      background: 'rgba(12,12,12,0.95)',
      color: '#fff',
      padding: '10px 14px',
      borderRadius: '10px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      border: '1px solid rgba(255,255,255,0.03)',
      fontWeight: 700,
      pointerEvents: 'auto',
      opacity: '0',
      transform: 'translateY(-6px)',
      transition: 'opacity .22s ease, transform .22s ease'
    });

    container.appendChild(el);
    // show
    requestAnimationFrame(() => {
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    });

    const duration = opts.duration ?? 3600;
    const timeout = setTimeout(() => dismiss(), duration);
    function dismiss() {
      clearTimeout(timeout);
      el.style.opacity = '0';
      el.style.transform = 'translateY(-6px)';
      el.addEventListener('transitionend', () => el.remove(), { once: true });
    }

    // allow click to dismiss
    el.addEventListener('click', dismiss);
    return { dismiss };
  }

  /* -------------------------
     Carousel
  --------------------------*/
  function initCarousel() {
    const list = $('.carousel .list');
    const items = $$('.carousel .item');
    const prevBtn = $('#prev');
    const nextBtn = $('#next');
    const timeBar = $('.time');
    if (!list || items.length === 0) return;

    let index = 0;
    const total = items.length;
    let autoplayInterval = 6000;
    let autoplayTimer = null;

    function goTo(i, options = {}) {
      index = ((i % total) + total) % total;
      const offset = -index * 100;
      list.style.transform = `translateX(${offset}%)`;
      resetProgressBar();
      if (options.announce !== false) {
        list.setAttribute('aria-live', 'polite');
      }
    }

    function next() { goTo(index + 1); }
    function prev() { goTo(index - 1); }

    function startAuto() {
      stopAuto();
      autoplayTimer = setInterval(next, autoplayInterval);
      resetProgressBar();
    }

    function stopAuto() {
      if (autoplayTimer) { clearInterval(autoplayTimer); autoplayTimer = null; }
      if (timeBar) {
        timeBar.style.animation = 'none';
        void timeBar.offsetWidth;
      }
    }

    function resetProgressBar() {
      if (!timeBar) return;
      timeBar.style.animation = 'none';
      void timeBar.offsetWidth;
      timeBar.style.animation = `heroProgress ${autoplayInterval}ms linear`;
    }

    prevBtn && prevBtn.addEventListener('click', () => { prev(); startAuto(); });
    nextBtn && nextBtn.addEventListener('click', () => { next(); startAuto(); });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { prev(); startAuto(); }
      if (e.key === 'ArrowRight') { next(); startAuto(); }
    });

    const carousel = document.querySelector('.carousel');
    if (carousel) {
      carousel.addEventListener('mouseenter', stopAuto);
      carousel.addEventListener('mouseleave', startAuto);
    }

    goTo(0, { announce: false });
    startAuto();
  }

  /* -------------------------
     Category Menu & Search Filter
  --------------------------*/
  function initFiltering() {
    const catItems = $$('.category-menu li');
    const searchInput = $('#anime-search');
    const cards = $$('.anime-card');

    function applyFilter() {
      const activeCatEl = $('.category-menu li.active');
      const activeCat = activeCatEl ? activeCatEl.dataset.category : 'all';
      const q = searchInput ? searchInput.value.trim().toLowerCase() : '';

      cards.forEach(card => {
        const title = (card.querySelector('.card-title')?.textContent || '').toLowerCase();
        const desc = (card.querySelector('.card-text')?.textContent || '').toLowerCase();
        const classes = Array.from(card.classList).map(c => c.toLowerCase());
        const matchesCategory = activeCat === 'all' ? true : classes.includes(activeCat.toLowerCase());
        const matchesQuery = q === '' ? true : (title.includes(q) || desc.includes(q));
        if (matchesCategory && matchesQuery) {
          card.style.display = '';
          card.setAttribute('aria-hidden', 'false');
        } else {
          card.style.display = 'none';
          card.setAttribute('aria-hidden', 'true');
        }
      });
    }

    if (!catItems.some(i => i.classList.contains('active'))) {
      const allItem = catItems.find(i => i.dataset.category === 'all');
      if (allItem) allItem.classList.add('active');
    }

    catItems.forEach(li => {
      li.addEventListener('click', (e) => {
        catItems.forEach(x => x.classList.remove('active'));
        li.classList.add('active');
        applyFilter();
      });
    });

    if (searchInput) {
      let t = null;
      searchInput.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(() => applyFilter(), 180);
      });
    }

    applyFilter();
  }

  /* -------------------------
     Planner (localStorage + conflict checks)
     (The user's original functions are preserved and reused)
  --------------------------*/
  const STORAGE_KEY = 'anivio-schedule-v1';

  function loadSchedule() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      return JSON.parse(raw);
    } catch (err) {
      console.error('Failed to load schedule', err);
      return [];
    }
  }

  function saveSchedule(list) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list || []));
    } catch (err) {
      console.error('Failed to save schedule', err);
    }
  }

  function isConflicting(newDate, newTime, existingList, toleranceMinutes = 60) {
    if (!newDate || !newTime) return false;
    const newDT = new Date(`${newDate}T${newTime}`);
    for (const e of existingList) {
      const eDT = new Date(`${e.date}T${e.time}`);
      const sameDay = e.date === newDate;
      if (!sameDay) continue;
      const diffMin = Math.abs((eDT - newDT) / (1000 * 60));
      if (diffMin < toleranceMinutes) return true;
    }
    return false;
  }

  function renderSchedule() {
    const list = loadSchedule();
    const ul = $('#schedule-output');
    if (!ul) return;
    ul.innerHTML = '';
    if (list.length === 0) {
      const li = document.createElement('li');
      li.textContent = 'No saved items yet.';
      li.style.color = '#9a9a9a';
      ul.appendChild(li);
      return;
    }
    list.forEach((item, idx) => {
      const li = document.createElement('li');
      li.className = 'schedule-item';
      li.dataset.idx = idx;
      li.style.display = 'flex';
      li.style.justifyContent = 'space-between';
      li.style.alignItems = 'center';
      li.style.opacity = '0';
      li.style.transform = 'translateY(6px)';
      li.style.transition = 'opacity .36s ease, transform .36s ease';

      const left = document.createElement('div');
      left.style.maxWidth = '75%';
      left.innerHTML = `<strong style="display:block">${escapeHtml(item.title)}</strong>
                        <small style="color:var(--muted)">${escapeHtml(item.date)} • ${escapeHtml(item.time)}</small>
                        ${item.note ? `<div style="color:var(--muted); font-size:.92rem; margin-top:6px">${escapeHtml(item.note)}</div>` : ''}`;

      const right = document.createElement('div');
      right.style.display = 'flex';
      right.style.gap = '8px';
      const delBtn = document.createElement('button');
      delBtn.className = 'btn-ghost';
      delBtn.type = 'button';
      delBtn.textContent = 'Remove';
      delBtn.addEventListener('click', () => {
        removeScheduleItem(idx);
      });

      right.appendChild(delBtn);
      li.appendChild(left);
      li.appendChild(right);
      ul.appendChild(li);

      // animate in
      requestAnimationFrame(() => {
        li.style.opacity = '1';
        li.style.transform = 'translateY(0)';
      });
    });
  }

  function removeScheduleItem(index) {
    const list = loadSchedule();
    if (index < 0 || index >= list.length) return;
    list.splice(index, 1);
    saveSchedule(list);
    renderSchedule();
    toast('Removed schedule item');
  }

  function clearSchedule() {
    localStorage.removeItem(STORAGE_KEY);
    renderSchedule();
    toast('Schedule cleared');
  }

  function addScheduleItem({ title, date, time, note }) {
    const list = loadSchedule();
    if (isConflicting(date, time, list, 60)) {
      return { ok: false, reason: 'conflict' };
    }
    list.push({ title, date, time, note });
    list.sort((a, b) => new Date(`${a.date}T${a.time}`) - new Date(`${b.date}T${b.time}`));
    saveSchedule(list);
    renderSchedule();
    return { ok: true };
  }

  function escapeHtml(s) {
    return (s + '').replace(/[&<>"']/g, (m) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
  }

  /* -------------------------
     Login modal & auth (lightweight, demo-only)
     - createLoginModal()
     - openLoginModal(callbackAfterSuccess)
  --------------------------*/
  function createLoginModal() {
    let mm = document.querySelector('.login-modal');
    if (mm) return mm;
    mm = document.createElement('div');
    mm.className = 'login-modal';
    mm.innerHTML = `
      <div class="login-box" role="dialog" aria-modal="true" aria-label="Login dialog">
        <button class="login-close" aria-label="Close login dialog">&times;</button>
        <h2>Login</h2>
        <form id="loginForm" autocomplete="on">
          <label for="loginUsername">Username or Email</label>
          <input id="loginUsername" name="username" type="text" placeholder="Username or email" required />
          <label for="loginPassword">Password</label>
          <input id="loginPassword" name="password" type="password" placeholder="Password" required />
          <div class="login-actions">
            <button type="submit" class="btn btn-primary">Login</button>
            <button type="button" class="btn btn-ghost login-cancel">Cancel</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(mm);

    // Close handlers
    mm.querySelectorAll('.login-close, .login-cancel').forEach(btn => {
      btn.addEventListener('click', () => closeLoginModal());
    });
    mm.addEventListener('click', (e) => {
      if (e.target === mm) closeLoginModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeLoginModal();
    });

    // form submit
    const form = mm.querySelector('#loginForm');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const username = form.querySelector('#loginUsername').value.trim();
      const password = form.querySelector('#loginPassword').value.trim();
      if (!username || !password) {
        toast('Please enter username & password', { duration: 2200 });
        return;
      }
      // Demo auth: store a flag in localStorage
      localStorage.setItem('anivio-user', JSON.stringify({ username, loggedAt: Date.now() }));
      closeLoginModal();
      toast(`Welcome, ${username}`);
      // call continuation if stored
      const cb = mm._afterLoginCallback;
      if (typeof cb === 'function') {
        mm._afterLoginCallback = null;
        setTimeout(() => cb(), 160); // slight delay to let modal close animate
      }
    });

    return mm;
  }

  function openLoginModal(afterSuccess) {
    const mm = createLoginModal();
    mm._afterLoginCallback = afterSuccess || null;
    // show
    mm.classList.add('active');
    document.body.style.overflow = 'hidden';
    // set focus
    setTimeout(() => {
      const input = mm.querySelector('#loginUsername');
      input && input.focus();
    }, 80);
  }

  function closeLoginModal() {
    const mm = document.querySelector('.login-modal');
    if (!mm) return;
    mm.classList.remove('active');
    document.body.style.overflow = '';
  }

  function isLoggedIn() {
    try {
      const raw = localStorage.getItem('anivio-user');
      if (!raw) return false;
      const obj = JSON.parse(raw);
      return !!obj?.username;
    } catch {
      return false;
    }
  }

  /* -------------------------
     Quick-add popover (used when clicking "Add to Planner" on cards)
     - shows date/time inputs near clicked button so user can add immediately
  --------------------------*/
  let activePopover = null;
  function createQuickAddPopover() {
    // singleton
    if (activePopover) return activePopover;
    const pop = document.createElement('div');
    pop.className = 'anivio-quickadd-popover';
    Object.assign(pop.style, {
      position: 'absolute',
      minWidth: '280px',
      background: '#0f0f0f',
      border: '1px solid rgba(255,255,255,0.06)',
      color: '#fff',
      padding: '12px',
      borderRadius: '12px',
      boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
      zIndex: 13000,
      transformOrigin: 'top left',
      opacity: '0',
      transform: 'translateY(6px) scale(0.98)',
      transition: 'opacity .22s ease, transform .22s ease'
    });

    pop.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:8px">
        <div style="font-weight:800; font-size:0.98rem" class="pop-title">Add to Planner</div>
        <label style="font-size:0.85rem; font-weight:700; color:#ddd">Day</label>
        <input type="date" class="pop-date" style="padding:8px; border-radius:8px; border:1px solid #222; background:#0b0b0b; color:#fff" />
        <label style="font-size:0.85rem; font-weight:700; color:#ddd">Time</label>
        <input type="time" class="pop-time" style="padding:8px; border-radius:8px; border:1px solid #222; background:#0b0b0b; color:#fff" />
        <div style="display:flex; gap:8px; margin-top:6px">
          <button class="btn btn-primary pop-add" type="button" style="flex:1">Add</button>
          <button class="btn btn-ghost pop-cancel" type="button" style="flex:1">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(pop);

    // handlers
    pop.querySelector('.pop-cancel').addEventListener('click', (e) => {
      closeQuickAddPopover();
    });

    pop.querySelector('.pop-add').addEventListener('click', (e) => {
      const date = pop.querySelector('.pop-date').value;
      const time = pop.querySelector('.pop-time').value;
      const title = pop._title || 'Untitled';
      if (!date || !time) {
        toast('Please pick day and time', { duration: 2200 });
        return;
      }
      const res = addScheduleItem({ title, date, time, note: '' });
      if (!res.ok && res.reason === 'conflict') {
        toast('Schedule conflict: choose another time.', { duration: 3200 });
        return;
      }
      closeQuickAddPopover();
      toast(`Added "${title}" to your schedule`);
    });

    activePopover = pop;
    return pop;
  }

  function openQuickAddPopover(anchorEl, title) {
    // if user not logged in => ask to login first, then reopen
    if (!isLoggedIn()) {
      openLoginModal(() => {
        // reopen after login
        setTimeout(() => openQuickAddPopover(anchorEl, title), 120);
      });
      return;
    }

    const pop = createQuickAddPopover();
    pop._title = title;
    // position: prefer below the anchor, adjust to viewport
    const rect = anchorEl.getBoundingClientRect();
    const docTop = window.scrollY || window.pageYOffset;
    const docLeft = window.scrollX || window.pageXOffset;
    // calculate left and top
    let left = rect.left + docLeft;
    let top = rect.bottom + docTop + 10;
    // ensure within viewport width
    const maxRight = left + pop.offsetWidth;
    if (maxRight > (window.innerWidth - 12)) {
      left = Math.max(12, window.innerWidth - pop.offsetWidth - 12);
    }
    // set initial
    Object.assign(pop.style, { left: `${left}px`, top: `${top}px`, opacity: '0', transform: 'translateY(6px) scale(.98)' });
    // small delay to allow measurement
    requestAnimationFrame(() => {
      pop.style.opacity = '1';
      pop.style.transform = 'translateY(0) scale(1)';
    });

    // click outside to close
    setTimeout(() => {
      document.addEventListener('click', outsideQuickAddListener);
    }, 10);
  }

  function closeQuickAddPopover() {
    if (!activePopover) return;
    activePopover.style.opacity = '0';
    activePopover.style.transform = 'translateY(6px) scale(.98)';
    document.removeEventListener('click', outsideQuickAddListener);
    // remove after transition
    setTimeout(() => {
      try { activePopover.remove(); } catch {}
      activePopover = null;
    }, 260);
  }

  function outsideQuickAddListener(e) {
    if (!activePopover) return;
    if (activePopover.contains(e.target)) return;
    if (e.target.closest('.planner-btn')) return; // clicking the same button won't close immediately
    closeQuickAddPopover();
  }

  /* -------------------------
     Planner initialization
     - binds planner form
     - binds card "Add to Planner" to quick-add popover
  --------------------------*/
  function initPlanner() {
    const form = $('#planner-form');
    const animeSelect = $('#animeSelect');
    const planDate = $('#planDate');
    const planTime = $('#planTime');
    const scheduleOutput = $('#schedule-output');
    const clearBtn = $('#clearSchedule');

    renderSchedule();

    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const title = animeSelect?.value?.trim() || 'Untitled';
        const date = planDate?.value;
        const time = planTime?.value;
        if (!date || !time) {
          toast('Please choose a day and time', { duration: 2800 });
          return;
        }
        if (!isLoggedIn()) {
          openLoginModal(() => {
            // attempt add after login
            const res = addScheduleItem({ title, date, time, note: '' });
            if (!res.ok && res.reason === 'conflict') {
              toast('Schedule conflict: another show is scheduled close to this time.', { duration: 4200 });
              return;
            }
            form.reset();
            toast('Added to your schedule');
          });
          return;
        }

        const res = addScheduleItem({ title, date, time, note: '' });
        if (!res.ok && res.reason === 'conflict') {
          toast('Schedule conflict: another show is scheduled close to this time.', { duration: 4200 });
          return;
        }
        form.reset();
        toast('Added to your schedule');
      });
    }

    clearBtn && clearBtn.addEventListener('click', (e) => {
      clearSchedule();
    });

    // bind cards' planner buttons to quick-add popover (modern flow)
    const cardPlannerBtns = $$('.planner-btn');
    cardPlannerBtns.forEach(btn => {
      // remove existing handlers to avoid duplicates
      btn.replaceWith(btn.cloneNode(true));
    });
    // reselect after clone
    const newCardPlannerBtns = $$('.planner-btn');
    newCardPlannerBtns.forEach(btn => {
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        const card = ev.target.closest('.anime-card');
        const title = (card?.querySelector('.card-title')?.textContent || '').trim();
        // if title exists, open quick-add; if not, fallback to prefill planner form
        if (title) {
          openQuickAddPopover(btn, title);
          toast(`Quick add: "${title}" (pick day & time)`, { duration: 2000 });
        } else {
          // fallback: prefill planner and scroll
          const animeSelect = $('#animeSelect');
          if (animeSelect && title) {
            const opt = Array.from(animeSelect.options).find(o => o.value.toLowerCase() === title.toLowerCase());
            if (opt) animeSelect.value = opt.value;
            else {
              const newOpt = document.createElement('option');
              newOpt.value = title; newOpt.textContent = title; animeSelect.appendChild(newOpt); animeSelect.value = title;
            }
          }
          const plannerSection = $('#planner');
          if (plannerSection) plannerSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });
    });

    // Also: allow prefill from "Add to Planner" in the hero (btns inside .hero-cta)
    const heroPlannerBtns = $$('.hero-cta .btn-ghost, .hero-cta .planner-btn');
    heroPlannerBtns.forEach(btn => {
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        const slide = ev.target.closest('.item');
        const title = (slide?.querySelector('.hero-title')?.textContent || '').trim();
        if (title) {
          openQuickAddPopover(btn, title);
          toast(`Quick add: "${title}"`, { duration: 2000 });
        }
      });
    });
  }

  /* -------------------------
     Ranking badges
  --------------------------*/
  function initRankingBadges() {
    const rankCards = $$('.ranking .rank-card');
    rankCards.forEach((el, i) => {
      const rank = i + 1;
      if (rank <= 5) {
        el.dataset.rank = String(rank);
      }
    });
  }

  /* -------------------------
     Support & newsletter forms
  --------------------------*/
  function initForms() {
    const supportForm = $('#issue-form');
    if (supportForm) {
      supportForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = $('#userName')?.value?.trim();
        const email = $('#userEmail')?.value?.trim();
        const message = $('#userMessage')?.value?.trim();
        if (!name || !email || !message) {
          toast('Please fill all support fields', { duration: 2400 });
          return;
        }
        const submitBtn = supportForm.querySelector('button[type="submit"]');
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Sending...';
        }
        setTimeout(() => {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit Issue';
          }
          supportForm.reset();
          toast('Issue submitted — check your email for a ticket ID');
        }, 900);
      });
    }

    const newsletterForm = $('#newsletterForm');
    if (newsletterForm) {
      newsletterForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = $('#newsletterEmail')?.value?.trim();
        if (!email || !email.includes('@')) {
          toast('Please enter a valid email address', { duration: 2200 });
          return;
        }
        const btn = newsletterForm.querySelector('button[type="submit"]');
        if (btn) {
          btn.disabled = true;
          btn.textContent = 'Subscribing...';
        }
        setTimeout(() => {
          if (btn) {
            btn.disabled = false;
            btn.textContent = 'Subscribe';
          }
          newsletterForm.reset();
          toast('Subscribed — welcome to the monthly digest!');
        }, 900);
      });
    }
  }

  /* -------------------------
     Scroll reveal animations
     - uses IntersectionObserver to add 'inview' class
     - For elements that need a smooth entrance
  --------------------------*/
  function initScrollAnimations() {
    const animatedSelectors = [
      '.section',
      '.anime-card',
      '.card-3d',
      '.rank-card',
      '.release-card',
      '.hero-title',
      '.spotlight-card'
    ];
    const elems = animatedSelectors.flatMap(s => $$(s));
    if (!('IntersectionObserver' in window) || elems.length === 0) {
      // fallback: add inview immediately
      elems.forEach(el => el.classList.add('inview'));
      return;
    }

    // set initial inline style for smoother control (avoid requiring CSS edits)
    elems.forEach((el) => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(18px)';
      el.style.transition = 'opacity .7s cubic-bezier(.15,.9,.35,1), transform .7s cubic-bezier(.15,.9,.35,1)';
    });

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        // stagger children slightly if there are many
        const children = Array.from(el.children || []);
        if (children.length > 3) {
          children.forEach((c, i) => {
            setTimeout(() => {
              c.style.opacity = '1';
              c.style.transform = 'translateY(0)';
            }, i * 80);
          });
        }
        el.style.opacity = '1';
        el.style.transform = 'translateY(0)';
        observer.unobserve(el);
      });
    }, { threshold: 0.12 });

    elems.forEach(el => observer.observe(el));
  }

  /* -------------------------
     Utility: debounce()
  --------------------------*/
  function debounce(fn, wait = 150) {
    let t = null;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  /* -------------------------
     Initialization
  --------------------------*/
  document.addEventListener('DOMContentLoaded', () => {
    try {
      initCarousel();
      initFiltering();
      initPlanner();
      initRankingBadges();
      initForms();
      initScrollAnimations();
      renderSchedule(); // ensure initial render
    } catch (err) {
      console.error('App init error', err);
    }
  });

  // Re-render schedule if other parts request it
  document.addEventListener('render-schedule', () => {
    try { renderSchedule(); } catch (e) { /* ignore */ }
  });

})();
