// Global Toast Notification System
(function() {
    // Automatically inject the container into the body on load if missing
    document.addEventListener('DOMContentLoaded', () => {
        if (!document.getElementById('toast-container')) {
            const container = document.createElement('div');
            container.id = 'toast-container';
            document.body.appendChild(container);
        }
    });

    window.showToast = function(message, type = 'success') {
        let container = document.getElementById('toast-container');
        
        // Fallback safety if called before DOMContentLoaded
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.setAttribute('role', 'button');
        toast.setAttribute('tabindex', '0');
        toast.setAttribute('aria-expanded', 'false');
        toast.setAttribute('aria-label', `${message}. Kattints a teljes üzenet megjelenítéséhez.`);
        toast.textContent = message;

        container.appendChild(toast);

        let remainingTime = 3000;
        let timerStartedAt;
        let removalTimer;
        let isPaused = false;
        let isExpanded = false;

        const removeToast = () => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        };

        const startTimer = () => {
            if (isPaused || isExpanded || !toast.isConnected) return;
            timerStartedAt = Date.now();
            removalTimer = setTimeout(removeToast, remainingTime);
        };

        const pauseTimer = () => {
            if (isPaused || isExpanded) return;
            isPaused = true;
            clearTimeout(removalTimer);
            remainingTime = Math.max(0, remainingTime - (Date.now() - timerStartedAt));
        };

        const resumeTimer = () => {
            if (!isPaused || isExpanded) return;
            isPaused = false;
            startTimer();
        };

        const toggleExpanded = () => {
            const shouldExpand = !isExpanded;
            if (shouldExpand) {
                pauseTimer();
            } else {
                isExpanded = false;
            }
            isExpanded = shouldExpand;
            toast.classList.toggle('expanded', isExpanded);
            toast.setAttribute('aria-expanded', String(isExpanded));
            toast.setAttribute(
                'aria-label',
                isExpanded ? `${message}. Kattints az üzenet összecsukásához.` : `${message}. Kattints a teljes üzenet megjelenítéséhez.`
            );

            if (!isExpanded && !toast.matches(':hover') && !toast.matches(':focus-within')) {
                resumeTimer();
            }
        };

        toast.addEventListener('mouseenter', pauseTimer);
        toast.addEventListener('mouseleave', resumeTimer);
        toast.addEventListener('focusin', pauseTimer);
        toast.addEventListener('focusout', (event) => {
            if (!toast.contains(event.relatedTarget)) resumeTimer();
        });
        toast.addEventListener('click', toggleExpanded);
        toast.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                toggleExpanded();
            }
        });

        setTimeout(() => {
            toast.classList.add('show');
        }, 10);

        startTimer();
    };
})();