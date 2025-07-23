// Custom validation messages
const errorMessages = {
    required: "This field is required",
    url: "Please enter a valid URL (e.g., https://www.example.com)",
    title: "Recipe title can only contain letters, numbers, and spaces",
    generic: "Please check this field",
    imageRequired: "Please select at least one image",
    ingredient: "Ingredient field cannot be empty",
    step: "Step field cannot be empty"
};

// Add error styling
function showError(input, message) {
    const formGroup = input.closest('.form-group');
    if (!formGroup) return;

    // Remove any existing error message
    const existingError = formGroup.querySelector('.error-message');
    if (existingError) {
        existingError.remove();
    }

    // Create and add new error message
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    formGroup.appendChild(errorDiv);
    input.classList.add('invalid');
}

// Remove error styling
function clearError(input) {
    const formGroup = input.closest('.form-group');
    if (!formGroup) return;

    const errorDiv = formGroup.querySelector('.error-message');
    if (errorDiv) {
        errorDiv.remove();
    }
    input.classList.remove('invalid');
}

// Validate required fields
function validateRequired(input) {
    if (!input.value.trim()) {
        let message = errorMessages.required;
        
        // Use specific messages for ingredients and steps
        if (input.closest('.ingredientsNode')) {
            message = errorMessages.ingredient;
        } else if (input.closest('.stepsNode')) {
            message = errorMessages.step;
        }
        
        showError(input, message);
        return false;
    }
    clearError(input);
    return true;
}

// Validate URL format
function validateUrl(input) {
    if (!input.value.trim()) {
        return true; // Skip if empty, let required validation handle it
    }

    try {
        new URL(input.value);
        clearError(input);
        return true;
    } catch {
        showError(input, errorMessages.url);
        return false;
    }
}

// Validate image upload
function validateImageUpload(input) {
    const errorDiv = input.closest('.form-group').querySelector('.error-message');
    if (!input.files || input.files.length === 0) {
        showError(input, errorMessages.imageRequired);
        if (errorDiv) errorDiv.style.display = 'block';
        return false;
    }
    clearError(input);
    if (errorDiv) errorDiv.style.display = 'none';
    return true;
}

// Validate all ingredient fields
function validateIngredients() {
    let isValid = true;
    document.querySelectorAll('.ingredientsNode').forEach(node => {
        const input = node.querySelector('input');
        const errorDiv = node.querySelector('.error-message');
        if (!input.value.trim()) {
            showError(input, errorMessages.ingredient);
            if (errorDiv) errorDiv.style.display = 'block';
            isValid = false;
        } else {
            clearError(input);
            if (errorDiv) errorDiv.style.display = 'none';
        }
    });
    return isValid;
}

// Validate all step fields
function validateSteps() {
    let isValid = true;
    document.querySelectorAll('.stepsNode').forEach(node => {
        const textarea = node.querySelector('textarea');
        const errorDiv = node.querySelector('.error-message');
        if (!textarea.value.trim()) {
            showError(textarea, errorMessages.step);
            if (errorDiv) errorDiv.style.display = 'block';
            isValid = false;
        } else {
            clearError(textarea);
            if (errorDiv) errorDiv.style.display = 'none';
        }
    });
    return isValid;
}

// Initialize form validation
function initFormValidation(formId) {
    const form = document.getElementById(formId);
    if (!form) return;

    const inputs = form.querySelectorAll('input[required]');
    const urlInputs = form.querySelectorAll('input[type="url"], input[name="link"]');
    const submitBtn = form.querySelector('button[type="submit"], .submitBtn');
    const imageInputs = form.querySelectorAll('input[type="file"]');

    // Add validation on blur for all required fields
    inputs.forEach(input => {
        input.addEventListener('blur', () => {
            validateRequired(input);
        });

        input.addEventListener('input', () => {
            if (input.value.trim()) {
                clearError(input);
            }
        });
    });

    // Add URL validation for link fields
    urlInputs.forEach(input => {
        input.addEventListener('blur', () => {
            validateUrl(input);
        });
    });

    // Add validation for image upload if this is an image recipe
    if (form.querySelector('input[name="isImg"]')) {
        imageInputs.forEach(input => {
            input.addEventListener('change', () => {
                validateImageUpload(input);
            });
        });
    }

    // Validate all fields on submit
    if (submitBtn) {
        submitBtn.addEventListener('click', (e) => {
            let isValid = true;

            // Validate all required fields
            inputs.forEach(input => {
                if (!validateRequired(input)) {
                    isValid = false;
                }
            });

            // Validate URLs
            urlInputs.forEach(input => {
                if (!validateUrl(input)) {
                    isValid = false;
                }
            });

            // Validate image upload if this is an image recipe
            if (form.querySelector('input[name="isImg"]')) {
                imageInputs.forEach(input => {
                    if (!validateImageUpload(input)) {
                        isValid = false;
                    }
                });
            }

            // Validate ingredients and steps if they exist
            if (document.querySelector('.ingredientsNode')) {
                if (!validateIngredients()) {
                    isValid = false;
                }
            }

            if (document.querySelector('.stepsNode')) {
                if (!validateSteps()) {
                    isValid = false;
                }
            }

            // Additional validation for image recipes
            if (form.querySelector('input[name="isImg"]')) {
                const imageInput = form.querySelector('.uploadInput');
                if (!validateImageUpload(imageInput)) {
                    isValid = false;
                }
            }

            // Additional validation for manual recipes
            if (!form.querySelector('input[name="isImg"]') && !form.querySelector('input[name="link"]')) {
                if (!validateIngredients()) {
                    isValid = false;
                }
                if (!validateSteps()) {
                    isValid = false;
                }
            }

            // Submit form if valid
            if (isValid && form.checkValidity()) {
                if (form.getAttribute('id') === 'submitRecipe') {
                    // Handle special case for recipe form
                    const categories = document.querySelector('.categories');
                    if (categories) {
                        categories.value = tags;
                    }
                }
                form.submit();
            }
        });
    }
}
