declare module 'pdfjs-dist/legacy/build/pdf.mjs' {
  export function getDocument(options: unknown): { promise: Promise<any> };
}
declare module 'mammoth/mammoth.browser' {
  const mammoth: { extractRawText(options: { arrayBuffer: ArrayBuffer }): Promise<{ value: string }> };
  export default mammoth;
}
declare module 'docx' {
  export const Document: any;
  export const Packer: any;
  export const Paragraph: any;
  export const TextRun: any;
  export const HeadingLevel: any;
  export const AlignmentType: any;
}