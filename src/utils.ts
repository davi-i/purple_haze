export const sanatizeString = (value: string) => {
  value = value.trim();
  return value.replace(/[\u200B-\u200D\uFEFF]/g, '');
}
