from .responses import ApiResponse


def success(
    message: str,
    data=None,
    code: str = "SUCCESS",
):
    return ApiResponse(
        success=True,
        code=code,
        message=message,
        data=data,
    )


def failure(
    message: str,
    code: str,
    data=None,
):
    return ApiResponse(
        success=False,
        code=code,
        message=message,
        data=data,
    )
