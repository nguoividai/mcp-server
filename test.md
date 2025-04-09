# React Development Guide

## Project Structure

```
src/
├── components/
│   ├── common/
│   └── features/
├── hooks/
├── services/
├── utils/
├── context/
└── pages/
```

## Best Practices

- Keep components small and focused
- Use functional components with hooks
- Implement proper error handling
- Follow consistent naming conventions

## Common Patterns

### Component Structure

```jsx
import React from "react";

const Component = ({ props }) => {
  // hooks
  // handlers
  // render
  return <div>Component</div>;
};

export default Component;
```

### Custom Hook Pattern

```jsx
const useCustomHook = () => {
  // hook logic
  return { data };
};
```

### Context Usage

```jsx
const AppContext = React.createContext();

const AppProvider = ({ children }) => {
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
```

## Performance Tips

- Use React.memo for component memoization
- Implement lazy loading
- Optimize re-renders
- Use proper key props in lists
