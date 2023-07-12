export const sanatizeString = (value: string) => {
  value = value.trim();
  // Remove zero width spaces
  return value.replace(/[\u200B-\u200D\uFEFF]/g, '');
}
