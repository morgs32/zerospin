export function sessionSubmissionKey(submission: {
  sessionId: string;
  sessionIndex: number;
}): string {
  return JSON.stringify([submission.sessionId, submission.sessionIndex]);
}
