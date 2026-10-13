export function isAtLeast18(dateOfBirth: Date, onDate: Date = new Date()): boolean {
  let age = onDate.getFullYear() - dateOfBirth.getFullYear();
  const monthDiff = onDate.getMonth() - dateOfBirth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && onDate.getDate() < dateOfBirth.getDate())) {
    age--;
  }
  return age >= 18;
}
