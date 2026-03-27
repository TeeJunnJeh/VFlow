export const PASSWORD_MIN_LENGTH = 6;

export const isStrongPassword = (value: string): boolean => {
  const password = String(value || '');
  return (
    password.length >= PASSWORD_MIN_LENGTH
    && /[A-Z]/.test(password)
    && /[a-z]/.test(password)
  );
};
