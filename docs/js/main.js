/* ============================================
   AC TECH - MAIN FUNCTIONALITY
   Core site interactions
   ============================================ */

(function () {
    'use strict';

    // ===== HEADER SCROLL BEHAVIOR =====

    const header = document.getElementById('header');
    let lastScrollY = 0;
    let ticking = false;

    function handleHeaderScroll() {
        const scrollY = window.scrollY;

        if (scrollY > 50) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }

        // Hide/show on scroll direction
        if (scrollY > lastScrollY && scrollY > 200) {
            header.style.transform = 'translateY(-100%)';
        } else {
            header.style.transform = 'translateY(0)';
        }

        lastScrollY = scrollY;
        ticking = false;
    }

    window.addEventListener('scroll', () => {
        if (!ticking) {
            requestAnimationFrame(handleHeaderScroll);
            ticking = true;
        }
    }, { passive: true });

    // ===== MOBILE MENU =====

    const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
    const nav = document.querySelector('.nav');

    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', () => {
            nav.classList.toggle('is-open');
            mobileMenuBtn.classList.toggle('is-active');
        });
    }

    // ===== TOAST NOTIFICATIONS =====

    let toastContainer = document.querySelector('.toast-container');

    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.className = 'toast-container';
        document.body.appendChild(toastContainer);
    }

    function showToast(message, type = 'info', duration = 4000) {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        const icons = {
            success: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>',
            error: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
            warning: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
            info: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
        };

        toast.innerHTML = `
      <span class="toast-icon" style="color: var(--color-${type === 'error' ? 'danger' : type})">${icons[type]}</span>
      <span class="toast-content">${message}</span>
      <button class="toast-close" aria-label="Fechar">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    `;

        toastContainer.appendChild(toast);

        const closeBtn = toast.querySelector('.toast-close');
        closeBtn.addEventListener('click', () => removeToast(toast));

        setTimeout(() => removeToast(toast), duration);
    }

    function removeToast(toast) {
        toast.style.animation = 'slideOutRight 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }

    // ===== COPY TO CLIPBOARD =====

    document.addEventListener('click', (e) => {
        const copyBtn = e.target.closest('[data-copy]');
        if (!copyBtn) return;

        const textToCopy = copyBtn.dataset.copy || copyBtn.previousElementSibling?.textContent;

        if (textToCopy) {
            navigator.clipboard.writeText(textToCopy.trim()).then(() => {
                showToast('Copiado para a área de transferência!', 'success');

                // Visual feedback
                const originalText = copyBtn.textContent;
                copyBtn.textContent = 'Copiado!';
                setTimeout(() => {
                    copyBtn.textContent = originalText;
                }, 2000);
            }).catch(() => {
                showToast('Erro ao copiar', 'error');
            });
        }
    });

    // ===== TOGGLE SWITCHES =====

    document.addEventListener('click', (e) => {
        const toggle = e.target.closest('.toggle-switch');
        if (!toggle) return;

        toggle.classList.toggle('active');

        const name = toggle.closest('.toggle-item')?.querySelector('.toggle-name')?.textContent;
        const isActive = toggle.classList.contains('active');

        showToast(`${name || 'Configuração'} ${isActive ? 'ativado' : 'desativado'}`, isActive ? 'success' : 'info');
    });

    // ===== SHOPPING CART =====

    const CART_KEY = 'ac_tech_cart';

    function getCart() {
        return JSON.parse(localStorage.getItem(CART_KEY) || '[]');
    }

    function saveCart(cart) {
        localStorage.setItem(CART_KEY, JSON.stringify(cart));
        updateCartBadge();
    }

    function addToCart(item) {
        const cart = getCart();
        const existingIndex = cart.findIndex(i => i.id === item.id);

        if (existingIndex >= 0) {
            cart[existingIndex].quantity += 1;
        } else {
            cart.push({ ...item, quantity: 1 });
        }

        saveCart(cart);
        showToast(`${item.name} adicionado ao carrinho!`, 'success');
    }

    function updateCartBadge() {
        const cart = getCart();
        const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
        const badges = document.querySelectorAll('.cart-badge');

        badges.forEach(badge => {
            badge.textContent = totalItems;
            badge.style.display = totalItems > 0 ? 'flex' : 'none';
        });
    }

    // Initialize cart badge
    updateCartBadge();

    // Add to cart buttons
    document.addEventListener('click', (e) => {
        const addBtn = e.target.closest('[data-add-to-cart]');
        if (!addBtn) return;

        const productCard = addBtn.closest('.product-card, [data-product]');
        if (!productCard) return;

        const item = {
            id: productCard.dataset.productId || Date.now().toString(),
            name: productCard.querySelector('.product-title, [data-product-name]')?.textContent || 'Produto',
            price: parseFloat(productCard.dataset.productPrice) || 0
        };

        addToCart(item);
    });

    // ===== SMOOTH SCROLL =====

    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', (e) => {
            e.preventDefault();
            const target = document.querySelector(anchor.getAttribute('href'));

            if (target) {
                const headerHeight = header?.offsetHeight || 72;
                const targetPosition = target.getBoundingClientRect().top + window.scrollY - headerHeight;

                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });

    // ===== ACCORDION / FAQ =====

    document.addEventListener('click', (e) => {
        const trigger = e.target.closest('[data-accordion-trigger]');
        if (!trigger) return;

        const item = trigger.closest('[data-accordion-item]');
        const content = item?.querySelector('[data-accordion-content]');

        if (item && content) {
            const isOpen = item.classList.contains('is-open');

            // Close all other items in the same accordion group
            const group = trigger.closest('[data-accordion-group]');
            if (group) {
                group.querySelectorAll('[data-accordion-item].is-open').forEach(openItem => {
                    if (openItem !== item) {
                        openItem.classList.remove('is-open');
                        openItem.querySelector('[data-accordion-content]').style.maxHeight = null;
                    }
                });
            }

            // Toggle current item
            item.classList.toggle('is-open');

            if (!isOpen) {
                content.style.maxHeight = content.scrollHeight + 'px';
            } else {
                content.style.maxHeight = null;
            }
        }
    });

    // ===== TABS =====

    document.addEventListener('click', (e) => {
        const tab = e.target.closest('[data-tab]');
        if (!tab) return;

        const tabGroup = tab.closest('[data-tab-group]');
        const targetId = tab.dataset.tab;

        if (tabGroup) {
            // Update active tab
            tabGroup.querySelectorAll('[data-tab]').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Update active panel
            tabGroup.querySelectorAll('[data-tab-panel]').forEach(panel => {
                panel.classList.toggle('active', panel.dataset.tabPanel === targetId);
            });
        }
    });

    // ===== MODAL =====

    function openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('is-open');
            document.body.style.overflow = 'hidden';
        }
    }

    function closeModal(modal) {
        modal.classList.remove('is-open');
        document.body.style.overflow = '';
    }

    document.addEventListener('click', (e) => {
        // Open modal
        const openTrigger = e.target.closest('[data-modal-open]');
        if (openTrigger) {
            openModal(openTrigger.dataset.modalOpen);
            return;
        }

        // Close modal
        const closeTrigger = e.target.closest('[data-modal-close]');
        if (closeTrigger) {
            const modal = closeTrigger.closest('.modal');
            if (modal) closeModal(modal);
            return;
        }

        // Close on backdrop click
        if (e.target.classList.contains('modal')) {
            closeModal(e.target);
        }
    });

    // Close modal on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const openModal = document.querySelector('.modal.is-open');
            if (openModal) closeModal(openModal);
        }
    });

    // ===== FORM VALIDATION =====

    document.querySelectorAll('form[data-validate]').forEach(form => {
        form.addEventListener('submit', (e) => {
            let isValid = true;

            form.querySelectorAll('[required]').forEach(field => {
                if (!field.value.trim()) {
                    isValid = false;
                    field.classList.add('is-invalid');
                } else {
                    field.classList.remove('is-invalid');
                }
            });

            // Email validation
            form.querySelectorAll('input[type="email"]').forEach(email => {
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (email.value && !emailRegex.test(email.value)) {
                    isValid = false;
                    email.classList.add('is-invalid');
                }
            });

            if (!isValid) {
                e.preventDefault();
                showToast('Por favor, preencha todos os campos obrigatórios', 'error');
            }
        });
    });

    // ===== VIDEO AUTOPLAY ON INTERSECT =====

    const videoObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const video = entry.target;
            if (entry.isIntersecting) {
                video.play().catch(() => { }); // Silently fail if autoplay blocked
            } else {
                video.pause();
            }
        });
    }, { threshold: 0.5 });

    document.querySelectorAll('video[data-autoplay]').forEach(video => {
        videoObserver.observe(video);
    });

    // ===== EXPOSE GLOBALS =====

    window.showToast = showToast;
    window.addToCart = addToCart;
    window.getCart = getCart;
    window.openModal = openModal;

})();

// ===== SLIDE OUT ANIMATION =====
const style = document.createElement('style');
style.textContent = `
  @keyframes slideOutRight {
    to {
      opacity: 0;
      transform: translateX(100%);
    }
  }
`;
document.head.appendChild(style);
