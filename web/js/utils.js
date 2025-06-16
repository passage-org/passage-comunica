
/// Format the date into a standard one, such as: 11:46:05.632
export function formatTime (date) {
    const hoursOnly = new Date(date).toLocaleString().split(' ')[1];
    const millisOnly = new Date(date).getMilliseconds();
    return hoursOnly + "." + String(millisOnly).padStart(3, '0');
};
