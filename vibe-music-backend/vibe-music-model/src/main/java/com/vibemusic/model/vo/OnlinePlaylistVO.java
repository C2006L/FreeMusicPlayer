package com.vibemusic.model.vo;

import lombok.Builder;
import lombok.Data;

import java.io.Serial;
import java.io.Serializable;

/**
 * Metadata of a platform's own recommended playlist. All values come from the
 * upstream recommendation feed; the client must not fill in missing fields
 * with invented titles, covers or play counts.
 */
@Data
@Builder
@lombok.NoArgsConstructor
@lombok.AllArgsConstructor
public class OnlinePlaylistVO implements Serializable {
    @Serial
    private static final long serialVersionUID = 1L;

    private String id;
    private String name;
    private String coverUrl;
    private Long trackCount;
    private Long playCount;
    private String creator;
    private String source;
    private String sourceName;
    private String link;
}
