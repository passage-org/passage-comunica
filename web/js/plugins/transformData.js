export function transformData(parsedData) {
  return parsedData.map((entry) => ({
    timestamp: entry.timestamp,
    n: entry.n,
    pn: entry.pn,
    subtype: entry.subtype,
    lo: entry.lo,
    m: entry.m || {},
  }));
}

// export function transformData(inputData) {
//   const lines = inputData.trim().split("\n");
//   return lines.map((line) => {
//     const [timestamp, json] = line.split(": ");
//     // console.log(json)
//     const data = JSON.parse(json);
//     return {
//       timestamp: parseInt(timestamp, 10),
//       n: data.n,
//       pn: data.pn,
//       subtype: data.subtype,
//       lo: data.lo,
//       m: data.m || {},
//     };
//   });
// }