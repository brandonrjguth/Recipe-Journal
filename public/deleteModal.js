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
        confirmBtn.addEventListener('click', async () => {
            if (this.currentForm) {
                await this.handleDelete();
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

    async handleDelete() {
        // Check if we're on the recipe detail page - if so, use form submission (redirect)
        if (window.location.pathname.includes('/recipe/') && !window.location.pathname.includes('/recipeList')) {
            this.currentForm.submit();
            return;
        }

        try {
            // Get form data
            const formData = new FormData(this.currentForm);
            const action = this.currentForm.action;
            
            // Send AJAX request
            const response = await fetch(action, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams(formData)
            });

            const result = await response.json();

            if (result.success) {
                // Find and remove the recipe element from DOM
                this.removeRecipeFromDOM();
            } else {
                console.error('Delete failed:', result.message);
                // Fallback to form submission for error handling
                this.currentForm.submit();
            }
        } catch (error) {
            console.error('Error during delete:', error);
            // Fallback to form submission
            this.currentForm.submit();
        }
    }

    removeRecipeFromDOM() {
        // Find the recipe container that contains this form
        let recipeElement = this.currentForm.closest('.contentRoworCol');
        if (!recipeElement) {
            // Try alternative selectors if the class name is different
            recipeElement = this.currentForm.closest('li');
        }
        
        if (recipeElement) {
            // Add fade out animation
            recipeElement.style.transition = 'opacity 0.3s ease-out, transform 0.3s ease-out';
            recipeElement.style.opacity = '0';
            recipeElement.style.transform = 'translateX(-20px)';
            
            // Remove element after animation
            setTimeout(() => {
                recipeElement.remove();
            }, 300);
        }
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