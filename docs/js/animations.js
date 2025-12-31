/* ============================================
   AC TECH - ANIMATION ENGINE
   Scroll Observer, Parallax, Counters
   ============================================ */

(function () {
    'use strict';

    // ===== SCROLL ANIMATION OBSERVER =====

    const animationObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');

                // Optionally unobserve after animation
                if (entry.target.dataset.animateOnce !== 'false') {
                    animationObserver.unobserve(entry.target);
                }
            }
        });
    }, {
        threshold: 0.15,
        rootMargin: '0px 0px -50px 0px'
    });

    // Initialize scroll animations
    function initScrollAnimations() {
        const animatedElements = document.querySelectorAll('[data-animate], [data-stagger]');
        animatedElements.forEach(el => animationObserver.observe(el));
    }

    // ===== PARALLAX ENGINE =====

    let ticking = false;
    const parallaxElements = [];

    function initParallax() {
        document.querySelectorAll('[data-parallax]').forEach(el => {
            parallaxElements.push({
                element: el,
                speed: parseFloat(getComputedStyle(el).getPropertyValue('--parallax-speed')) || 0.5
            });
        });

        if (parallaxElements.length > 0) {
            window.addEventListener('scroll', handleParallax, { passive: true });
        }
    }

    function handleParallax() {
        if (!ticking) {
            requestAnimationFrame(() => {
                parallaxElements.forEach(({ element, speed }) => {
                    const rect = element.getBoundingClientRect();
                    const scrollY = window.scrollY;
                    const offset = (rect.top + scrollY) * speed;
                    element.style.transform = `translateY(${-offset}px)`;
                });
                ticking = false;
            });
            ticking = true;
        }
    }

    // ===== ANIMATED COUNTERS =====

    function animateCounter(element) {
        const target = parseInt(element.dataset.target, 10);
        const duration = parseInt(element.dataset.duration, 10) || 2000;
        const suffix = element.dataset.suffix || '';
        const prefix = element.dataset.prefix || '';

        let startTime = null;
        const startValue = 0;

        function easeOutExpo(t) {
            return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
        }

        function updateCounter(currentTime) {
            if (!startTime) startTime = currentTime;
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easedProgress = easeOutExpo(progress);
            const currentValue = Math.floor(startValue + (target - startValue) * easedProgress);

            element.textContent = prefix + currentValue.toLocaleString('pt-BR') + suffix;

            if (progress < 1) {
                requestAnimationFrame(updateCounter);
            }
        }

        requestAnimationFrame(updateCounter);
    }

    const counterObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                animateCounter(entry.target);
                counterObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.5 });

    function initCounters() {
        document.querySelectorAll('[data-counter]').forEach(el => {
            counterObserver.observe(el);
        });
    }

    // ===== MOUSE GLOW EFFECT =====

    function initMouseGlow() {
        const glowContainers = document.querySelectorAll('[data-mouse-glow]');

        glowContainers.forEach(container => {
            container.addEventListener('mousemove', (e) => {
                const rect = container.getBoundingClientRect();
                const x = ((e.clientX - rect.left) / rect.width) * 100;
                const y = ((e.clientY - rect.top) / rect.height) * 100;
                container.style.setProperty('--mouse-x', `${x}%`);
                container.style.setProperty('--mouse-y', `${y}%`);
            });
        });
    }

    // ===== TILT EFFECT =====

    function initTiltEffect() {
        const tiltElements = document.querySelectorAll('[data-tilt]');

        tiltElements.forEach(el => {
            const maxTilt = parseFloat(el.dataset.tilt) || 10;

            el.addEventListener('mousemove', (e) => {
                const rect = el.getBoundingClientRect();
                const centerX = rect.left + rect.width / 2;
                const centerY = rect.top + rect.height / 2;
                const mouseX = e.clientX - centerX;
                const mouseY = e.clientY - centerY;
                const rotateX = (mouseY / (rect.height / 2)) * -maxTilt;
                const rotateY = (mouseX / (rect.width / 2)) * maxTilt;

                el.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;
            });

            el.addEventListener('mouseleave', () => {
                el.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) scale3d(1, 1, 1)';
            });
        });
    }

    // ===== MAGNETIC BUTTONS =====

    function initMagneticButtons() {
        const magneticElements = document.querySelectorAll('[data-magnetic]');

        magneticElements.forEach(el => {
            const strength = parseFloat(el.dataset.magnetic) || 0.3;

            el.addEventListener('mousemove', (e) => {
                const rect = el.getBoundingClientRect();
                const x = e.clientX - rect.left - rect.width / 2;
                const y = e.clientY - rect.top - rect.height / 2;

                el.style.transform = `translate(${x * strength}px, ${y * strength}px)`;
            });

            el.addEventListener('mouseleave', () => {
                el.style.transform = 'translate(0, 0)';
            });
        });
    }

    // ===== PROGRESS ON SCROLL =====

    function initScrollProgress() {
        const progressBar = document.querySelector('[data-scroll-progress]');

        if (progressBar) {
            window.addEventListener('scroll', () => {
                const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
                const scrolled = (window.scrollY / scrollHeight) * 100;
                progressBar.style.width = `${scrolled}%`;
            }, { passive: true });
        }
    }

    // ===== SMOOTH REVEAL IMAGES =====

    const imageObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                if (img.dataset.src) {
                    img.src = img.dataset.src;
                    img.removeAttribute('data-src');
                }
                img.classList.add('is-loaded');
                imageObserver.unobserve(img);
            }
        });
    }, { rootMargin: '50px' });

    function initLazyImages() {
        document.querySelectorAll('img[data-src]').forEach(img => {
            imageObserver.observe(img);
        });
    }

    // ===== TEXT SPLIT FOR ANIMATION =====

    function splitTextToWords(element) {
        const text = element.textContent;
        const words = text.split(' ');
        element.innerHTML = words.map(word => `<span class="word">${word}</span>`).join(' ');
    }

    function initSplitText() {
        document.querySelectorAll('[data-split-text]').forEach(el => {
            splitTextToWords(el);
        });
    }

    // ===== TYPING EFFECT =====

    function typeText(element, text, speed = 50) {
        let i = 0;
        element.textContent = '';

        function type() {
            if (i < text.length) {
                element.textContent += text.charAt(i);
                i++;
                setTimeout(type, speed);
            }
        }

        type();
    }

    function initTypingEffect() {
        document.querySelectorAll('[data-typing]').forEach(el => {
            const text = el.dataset.typing || el.textContent;
            const speed = parseInt(el.dataset.typingSpeed, 10) || 50;

            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        typeText(el, text, speed);
                        observer.unobserve(el);
                    }
                });
            }, { threshold: 0.5 });

            observer.observe(el);
        });
    }

    // ===== MARQUEE =====

    function initMarquee() {
        document.querySelectorAll('.marquee').forEach(marquee => {
            const content = marquee.innerHTML;
            marquee.innerHTML = content + content; // Duplicate for seamless loop
        });
    }

    // ===== INITIALIZATION =====

    function init() {
        initScrollAnimations();
        initParallax();
        initCounters();
        initMouseGlow();
        initTiltEffect();
        initMagneticButtons();
        initScrollProgress();
        initLazyImages();
        initSplitText();
        initTypingEffect();
        initMarquee();
    }

    // Run when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Expose for external use
    window.ACAnimations = {
        init,
        animateCounter,
        typeText,
        splitTextToWords
    };

})();
