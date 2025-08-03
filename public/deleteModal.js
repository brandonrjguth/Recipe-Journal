// Delete Modal Functionality
class DeleteModal {
    constructor() {
        this.modal = null;
        this.currentForm = null;
        this.init();
    }

    init() {
        // Create modal HTML if it doesn't exist
        if (!document.querySelector('.delete-modal')) {
            this.createModal();
        }
        this.modal = document.querySelector('.delete-modal');
        this.bindEvents();
    }

    createModal() {
        const modalHTML = `
            <div class="delete-modal" id="deleteModal">
                <div class="delete-modal-content">
                    <h3>Delete Recipe</h3>
                    <p>Are you sure you want to delete this recipe? This action cannot be undone.</p>
                    <div class="delete-modal-buttons">
                        <button type="button" class="delete-modal-btn cancel" id="cancelDelete">Cancel</button>
                        <button type="button" class="delete-modal-btn confirm" id="confirmDelete">Delete</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }

    bindEvents() {
        const cancelBtn = document.getElementById('cancelDelete');
        const confirmBtn = document.getElementById('confirmDelete');
        
        // Close modal on cancel
        cancelBtn.addEventListener('click', () => this.hide());
        
        // Close modal on background click
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.hide();
            }
        });
        
        // Close modal on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.modal.classList.contains('show')) {
                this.hide();
            }
        });
        
        // Confirm deletion
        confirmBtn.addEventListener('click', () => {
            if (this.currentForm) {
                this.currentForm.submit();
            }
            this.hide();
        });
    }

    show(form) {
        this.currentForm = form;
        this.modal.classList.add('show');
        // Focus the confirm button for accessibility
        setTimeout(() => {
            document.getElementById('confirmDelete').focus();
        }, 100);
    }

    hide() {
        this.modal.classList.remove('show');
        this.currentForm = null;
    }
}

// Initialize the delete modal when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    window.deleteModal = new DeleteModal();
});

// Helper function to show delete confirmation
function showDeleteConfirmation(form) {
    if (window.deleteModal) {
        window.deleteModal.show(form);
    }
}