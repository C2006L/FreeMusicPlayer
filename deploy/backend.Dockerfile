FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /build
COPY vibe-music-backend/ .
RUN mvn -B -DskipTests package
FROM eclipse-temurin:17-jre
WORKDIR /app
RUN groupadd --system fmp && useradd --system --gid fmp fmp
COPY --from=build --chown=fmp:fmp /build/vibe-music-server/target/vibe-music-server-0.0.1-SNAPSHOT.jar app.jar
USER fmp
EXPOSE 18080
ENTRYPOINT ["java","-jar","app.jar"]
