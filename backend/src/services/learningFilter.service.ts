export const shouldLearn = (input: string, output: string) => {

  const text = (input + " " + output).toLowerCase();

  /* ❌ skip useless */
  if (text.length < 20) return false;
  if (text.includes("no information available")) return false;
  if (text.includes("sorry")) return false;

  /* ❌ skip greetings */
  if (/hi|hello|hey/.test(text)) return false;

  return true;
};