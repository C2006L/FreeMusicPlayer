package com.vibemusic.enumeration;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonCreator;
import lombok.Getter;

@Getter
public enum UserStatusEnum {

    ENABLE(0, "启用"),
    DISABLE(1, "禁用");

    @EnumValue
    private final Integer id;
    private final String userStatus;

    UserStatusEnum(Integer id, String userStatus) {
        this.id = id;
        this.userStatus = userStatus;
    }

    /**
     * 兼容枚举名（ENABLE/DISABLE）、中文（启用/禁用）与状态 id（0-启用，1-禁用）三种写法。
     * 无法识别时抛出 IllegalArgumentException，由全局异常处理转换为 400 响应。
     */
    @JsonCreator(mode = JsonCreator.Mode.DELEGATING)
    public static UserStatusEnum fromJson(Object raw) {
        if (raw == null) {
            return null;
        }
        if (raw instanceof Number number) {
            return fromId(number.intValue());
        }
        String text = String.valueOf(raw).trim();
        if (text.isEmpty()) {
            return null;
        }
        for (UserStatusEnum value : values()) {
            if (value.name().equalsIgnoreCase(text) || value.userStatus.equals(text)) {
                return value;
            }
        }
        if (text.matches("-?\\d+")) {
            return fromId(Integer.parseInt(text));
        }
        throw new IllegalArgumentException("无效的用户状态：" + text + "，仅支持 ENABLE/DISABLE 或 0/1");
    }

    private static UserStatusEnum fromId(int id) {
        for (UserStatusEnum value : values()) {
            if (value.id == id) {
                return value;
            }
        }
        throw new IllegalArgumentException("无效的用户状态：" + id + "，仅支持 0-启用 或 1-禁用");
    }

}
