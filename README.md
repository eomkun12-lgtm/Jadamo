# JADAMO OCEAN Trip

JADAMO 크루의 여행 일정, 참석자, 다이빙 로그와 수중 사진을 관리하는 오션 아틀라스입니다.

- [운영 사이트](https://jadamo-trip.eomkun12.chatgpt.site)
- [변경 및 배포 히스토리](HISTORY.md)

## 개발

Node.js 22.13 이상과 Bash가 필요합니다.

```sh
npm run install:ci
npm run dev
npm test
```

데이터 스키마를 변경한 경우 `npm run db:generate`로 마이그레이션을 생성합니다. Sites 설정과 D1/R2 바인딩은 `.openai/hosting.json`에서 관리합니다.
