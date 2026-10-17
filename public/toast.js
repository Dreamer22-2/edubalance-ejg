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
        toast.textContent = message;

        container.appendChild(toast);

        // Trigger sliding entry animation
        setTimeout(() => {
            toast.classList.add('show');
        }, 10);

        // Remove after 3 seconds with exit transition
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                toast.remove();
            }, 300);
        }, 3000);
    };
})();