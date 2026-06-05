export function multipartJobRoute({
  code = "JOB_SUBMIT_ERROR",
  handler,
  logUnexpectedError,
  tempFiles,
}) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      await tempFiles.cleanup(req.files ?? req.file);
      if (res.headersSent) {
        next(error);
        return;
      }
      logUnexpectedError?.(`${req.method} ${req.originalUrl}`, error);
      res.status(500).json({
        code,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };
}
