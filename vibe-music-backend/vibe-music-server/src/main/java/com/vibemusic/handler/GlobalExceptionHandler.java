package com.vibemusic.handler;

import com.vibemusic.constant.MessageConstant;
import lombok.extern.slf4j.Slf4j;
import com.vibemusic.result.Result;
import org.springframework.http.HttpStatus;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.http.converter.HttpMessageNotReadableException;

import java.sql.SQLIntegrityConstraintViolationException;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {
    @ExceptionHandler(org.springframework.web.server.ResponseStatusException.class)
    public org.springframework.http.ResponseEntity<?> status(org.springframework.web.server.ResponseStatusException ex) {
        return org.springframework.http.ResponseEntity.status(ex.getStatusCode()).body(java.util.Map.of(
                "code", 1, "message", ex.getReason() == null ? "请求失败" : ex.getReason(),
                "requestId", java.util.Objects.toString(org.slf4j.MDC.get("requestId"), "")));
    }
    @ExceptionHandler(IllegalArgumentException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public Result invalid(IllegalArgumentException ex) { return Result.error(ex.getMessage()); }

    private static final Pattern DUPLICATE_ENTRY_PATTERN = Pattern.compile("Duplicate entry '(.+?)' for key '(.+?)'");

    /**
     * 统一返回错误结果
     *
     * @param message 错误信息
     * @return
     */
    private Result errorResult(String message) {
        return Result.error(message);
    }

    /**
     * 处理SQL异常
     *
     * @param ex
     * @return
     */
    @ExceptionHandler(SQLIntegrityConstraintViolationException.class)
    public Result handleSqlIntegrityConstraintViolationException(SQLIntegrityConstraintViolationException ex) {
        log.error("SQL异常：{}", ex.getMessage(), ex);
        Matcher matcher = DUPLICATE_ENTRY_PATTERN.matcher(ex.getMessage());
        try {
            if (matcher.find()) {
                String msg = matcher.group(2) + " " + MessageConstant.ALREADY_EXISTS;
                return errorResult(msg);
            }
        } catch (IndexOutOfBoundsException e) {
            log.error("解析SQL异常时发生错误：{}", e.getMessage(), e);
        }
        return errorResult(MessageConstant.UNKNOWN_ERROR);
    }

    /**
     * 处理参数校验异常
     *
     * @param ex
     * @return
     */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public Result handleMethodArgumentNotValidException(MethodArgumentNotValidException ex) {
        log.warn("参数校验失败，字段：{}", ex.getBindingResult().getFieldErrors().stream().map(org.springframework.validation.FieldError::getField).toList());
        // 获取所有校验失败的字段和错误信息
        String errorMessage = ex.getBindingResult().getFieldErrors().stream()
                .map(fieldError -> fieldError.getField() + ": " + fieldError.getDefaultMessage())
                .reduce((msg1, msg2) -> msg1 + "; " + msg2)
                .orElse("参数校验失败");
        return errorResult(errorMessage);
    }

    /**
     * 处理请求体解析异常（如枚举值非法），属于客户端参数错误，返回 400 而不是 500。
     *
     * @param ex 解析异常
     * @return
     */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public Result handleHttpMessageNotReadableException(HttpMessageNotReadableException ex) {
        Throwable cause = ex.getMostSpecificCause();
        String message = cause instanceof IllegalArgumentException && cause.getMessage() != null
                ? cause.getMessage()
                : "请求参数格式错误";
        log.warn("请求体解析失败：{}", message);
        return errorResult(message);
    }

    /**
     * 处理其他未知异常，兜底异常处理
     *
     * @param ex
     * @return
     */
    @ExceptionHandler(Exception.class)
    @ResponseStatus(HttpStatus.INTERNAL_SERVER_ERROR)
    public Result handleException(Exception ex) {
        log.error("未知异常：{}", ex.getMessage(), ex);
        String message = "服务暂时不可用，请凭请求编号排查：" + java.util.Objects.toString(org.slf4j.MDC.get("requestId"), "unknown");
        return errorResult(message);
    }
}
