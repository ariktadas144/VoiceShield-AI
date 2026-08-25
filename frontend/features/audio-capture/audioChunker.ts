export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64data = reader.result as string;
      // Strip off data url prefix e.g. "data:audio/webm;base64,"
      const base64Clean = base64data.includes(",")
        ? base64data.split(",")[1]
        : base64data;
      resolve(base64Clean);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function sliceFileIntoChunks(file: File, chunkSizeBytes: number): Blob[] {
  const chunks: Blob[] = [];
  let start = 0;
  while (start < file.size) {
    const end = Math.min(start + chunkSizeBytes, file.size);
    chunks.push(file.slice(start, end));
    start = end;
  }
  return chunks;
}
