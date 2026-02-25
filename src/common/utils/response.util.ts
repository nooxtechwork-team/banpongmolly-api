export class ResponseUtil {
  static success<T>(
    data?: T,
    message: string = 'สำเร็จ',
  ): {
    success: true;
    message: string;
    data?: T;
  } {
    return {
      success: true,
      message,
      ...(data !== undefined && { data }),
    };
  }

  static error(
    message: string,
    error?: string,
  ): {
    success: false;
    message: string;
    error?: string;
  } {
    return {
      success: false,
      message,
      ...(error && { error }),
    };
  }
}
