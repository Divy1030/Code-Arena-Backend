import { Request, Response, NextFunction, RequestHandler } from 'express';

const asyncHandler = (requestHandler: RequestHandler) => {
    return (req: Request, res: Response, next: NextFunction): void => {
        Promise.resolve(requestHandler(req, res, next)).catch((err) => next(err));
    };
};


export { asyncHandler };
