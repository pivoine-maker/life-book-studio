export interface ExtractedFrame {
  localPath: string;
  atSecond: number;
}

export async function extractFrame(path: string, atSecond: number): Promise<ExtractedFrame> {
  return { localPath: path, atSecond };
}

export async function extractTailFrame(path: string): Promise<ExtractedFrame> {
  return { localPath: path, atSecond: -1 };
}
