/**
 * Generates a timestamp string.
 * @param humanReadable - If true, returns a human-readable format (YYYY-MM-DD HH:MM:SS AM/PM).
 *                        Otherwise, returns an ISO string.
 * @returns The formatted timestamp string.
 */
export const getTimestamp = (humanReadable: boolean = false): string => {
  const now = new Date();
  if (humanReadable) {
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    let hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const seconds = String(now.getSeconds()).padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12;
    const hoursStr = String(hours).padStart(2, "0");

    return `${year}-${month}-${day} ${hoursStr}:${minutes}:${seconds} ${ampm}`;
  }
  return now.toISOString();
};
