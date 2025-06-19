
/// Format the date into a standard one, such as: 11:46:05.632
export function formatTime (date) {
    const hoursOnly = new Date(date).toLocaleString().split(" ")[1];
    const millisOnly = new Date(date).getMilliseconds();
    return hoursOnly + "." + String(millisOnly).padStart(3, "0");
};


/// Format a duration from milliseconds to the bigger matching
/// unit. So it's more human readable.
export function formatDuration(ms) {
    const units = [
        { label: "h", ms: 60*60*1000 },
        { label: "min", ms: 60*1000 },
        { label: "s", ms: 1000 },
        { label: "ms", ms: 1 }
    ];

    for (const unit of units) {
        if (ms >= unit.ms) {
            const value = ms / unit.ms;
            return `${parseFloat(value.toFixed(2))}${unit.label}`;
        }
    }

    return "0ms";
}
