// Custom validation messages
const errorMessages = {
    required: "This field is required",
    url: "Please enter a valid URL (e.g., https://www.example.com)",
    title: "Recipe title can only contain letters, numbers, and spaces",
    generic: "Please check this field",
    imageRequired: "Please select at least one image",
    ingredient: "Ingredient field cannot be empty",
    step: "Step field cannot be empty",
    emailAsUsername: "Display name cannot be an email address"
};

// Add error styling
function showError(input, message) {
    const formGroup = input.closest('.form-group');
    if (!formGroup) return;

    // Remove any existing error message
    let errorDiv = formGroup.querySelector('.error-message');
    if (!errorDiv) {
        errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        // Insert after the input row if it exists, otherwise at the end
        const inputRow = formGroup.querySelector('.input-row');
        if (inputRow) {
            inputRow.parentNode.insertBefore(errorDiv, inputRow.nextSibling);
        } else {
            formGroup.appendChild(errorDiv);
        }
    }

    errorDiv.textContent = message;
    errorDiv.style.display = 'block'; // Make sure it's visible
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
        showError(input, errorMessages.required); // Assume it's required if this function is called
        return false; 
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
    const formGroup = input.closest('.form-group');
    const errorDiv = formGroup.querySelector('.error-message');
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
    document.querySelectorAll('.ingredientsList .ingredientsNode').forEach(node => {
        const input = node.querySelector('input, textarea');
        if (!validateRequired(input)) {
           isValid = false;
        }
    });
    return isValid;
}

// Validate all step fields
function validateSteps() {
    let isValid = true;
    document.querySelectorAll('.stepsList .stepsNode').forEach(node => {
        const textarea = node.querySelector('textarea');
        if (!validateRequired(textarea)) {
            isValid = false;
        }
    });
    return isValid;
}

/**
 * Initializes form validation behaviors.
 * This version removes on-blur validation and redundant submit handlers.
 * Validation is now primarily triggered by the script in the main HTML file.
 */
function initFormValidation(formId) {
    const form = document.getElementById(formId);
    if (!form) return;

    const allInputs = form.querySelectorAll('input[required], textarea[required]');

    // Add an 'input' listener to all fields.
    // This provides good user experience by clearing an error message
    // as soon as the user starts typing to correct it.
    allInputs.forEach(input => {
        input.addEventListener('input', () => {
            // Check if the field has a value and if it was previously invalid
            if (input.value.trim() && input.classList.contains('invalid')) {
                clearError(input);
            }
        });
    });

    // The event listeners for 'blur' have been removed to prevent validation
    // from running every time a user clicks away from an input field.

    // The event listener for the submit button has also been removed from this file,
    // as it is already correctly handled in your newRecipe.html script tag.
    // This prevents redundant code and potential conflicts.
}