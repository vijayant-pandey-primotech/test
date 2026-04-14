# Toast Component - Quick Usage Guide

## Bare Minimum Requirements

### 1. Import the Toast components
```jsx
import { Toast, useToast } from 'components/Toast';
```

### 2. Use the hook in your component
```jsx
const { toast, showSuccess, showError, hideToast } = useToast();
```

### 3. Add the Toast component to your JSX
```jsx
<Toast
  isOpen={toast.isOpen}
  message={toast.message}
  type={toast.type}
  position={toast.position}
  onClose={hideToast}
/>
```

### 4. Show toasts anywhere in your component
```jsx
// Success toast
showSuccess("Operation completed successfully!");

// Error toast  
showError("Something went wrong!");

// Warning toast
showWarning("Please check your input!");

// Info toast
showInfo("Here's some information.");
```

## Complete Example

```jsx
import React from 'react';
import { Button } from 'reactstrap';
import { Toast, useToast } from 'components/Toast';

const MyComponent = () => {
  const { toast, showSuccess, showError, hideToast } = useToast();

  const handleSave = async () => {
    try {
      // Your save logic here
      await saveData();
      showSuccess("Data saved successfully!");
    } catch (error) {
      showError("Failed to save data!");
    }
  };

  return (
    <div>
      <Button onClick={handleSave}>Save</Button>
      
      {/* Add this at the end of your component */}
      <Toast
        isOpen={toast.isOpen}
        message={toast.message}
        type={toast.type}
        position={toast.position}
        onClose={hideToast}
      />
    </div>
  );
};

export default MyComponent;
```

## Available Methods

- `showSuccess(message, position?)` - Green toast
- `showError(message, position?)` - Red toast  
- `showWarning(message, position?)` - Orange toast
- `showInfo(message, position?)` - Blue toast
- `hideToast()` - Manually hide toast

## Available Positions

- `"top"` (default)
- `"top-right"`
- `"top-left"`
- `"bottom"`
- `"bottom-right"`
- `"bottom-left"`

## That's it! 🎉

Just these 4 steps and you have beautiful, consistent toast notifications in any component.