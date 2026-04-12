질문자님의 요청대로 **MedMinder AI** 프로젝트를 엔지니어링 관점에서 구조화한 **Project Plan**입니다. 이 문서는 단순한 일정이 아니라, `Cursor`가 작업을 수행할 때마다 자신의 위치와 목적을 확인하는 **나침반** 역할을 하게 됩니다.

---

# Project Plan: MedMinder AI
**"Closing the Health Equity Gap through Precision Adherence"**

## 1. Strategic Overview (The Vision)
* **Product Definition**: 저소득층 고령 이민자를 위한 AI 기반 복약 관리 및 안전 모니터링 PWA 플랫폼.
* **Problem**: 언어 장벽(이민자), 인지 저하(고령층), 복잡한 처방 체계로 인한 복약 불이행 및 약물 사고.
* **Solution**: Vision AI를 통한 처방전 즉시 디지털화 + openFDA 기반 교차 검증 + 3개국어 맞춤형 행동 가이드.
* **North Star Metric**: **Adherence Accuracy & Rate** (처방 대비 실제 복용률 90% 이상 유지).

---

## 2. Roadmap: The 3-Phase Execution

### Phase 1: High-Precision Foundation (Week 1-2)
**Goal**: 데이터 무결성 확보 및 의학적 정확성 검증 엔진 구축.

* **[Task 1] Accuracy-First Schema (Supabase/Postgres)**
    * `profiles`: 거주 지역, 선호 언어(KR/EN/ES), 보호자 연락처.
    * `medications`: AI 추출 데이터와 openFDA 공식 명칭을 매핑하여 저장.
    * `adherence_logs`: 복용 여부, 실제 복용 시각, 미복용 사유 기록.
    * **Strict Rule**: 모든 시간 데이터는 타겟 유저의 현지 타임존을 기준으로 처리.
* **[Task 2] The "Parsing Engine" (Server-side)**
    * `services/vision.server.ts`: GPT-4o Vision을 활용한 비정형 처방전 데이터 구조화.
    * `services/fda_verify.ts`: openFDA API를 연동하여 추출된 약물명 및 주의사항 검증.
* **[Task 3] Mobile-First Layout & PWA Setup**
    * Next.js 14 기반 고대비(High-Contrast), 거대 버튼(Big Buttons) UI 프레임워크 구축.
    * PWA 설정을 통해 모바일 홈 화면 설치 및 푸시 알림 환경 조성.

### Phase 2: Accessibility & Smart Engagement (Week 3-4)
**Goal**: 고령층 특화 UX 구현 및 능동적 복약 유도.

* **[Task 4] High-Accessibility Interface**
    * **One-Tap Action**: 복잡한 입력 없이 '지금 복용' 버튼 하나로 모든 프로세스 종료.
    * **Tri-lingual Support**: i18next를 활용한 영어/한국어/스페인어 실시간 전환.
* **[Task 5] Adaptive Alert System**
    * 처방전 파싱 데이터 기반 알람 자동 생성 로직.
    * 미복용 시 단계별 알림 및 햅틱 피드백(진동) 제공.

### Phase 3: Clinical Insight & Scaling (Week 5)
**Goal**: 임상적 가치 증명 및 리포팅 시스템 구축.

* **[Task 6] Physician-Ready Report**: 복약 추이 데이터를 시각화하여 진료 시 공유 가능한 PDF/Web 리포트 생성.
* **[Task 7] Edge Case Optimization**: 저사양 모바일 기기 성능 최적화 및 오프라인 모드(캐시 기반) 지원.

---

## 3. Technical Justification (The Stack)
* **Next.js 14 & Vercel**: 서버 사이드 렌더링을 통해 저사양 모바일 기기에서도 빠른 초기 구동 보장.
* **GPT-4o Vision**: 인간의 개입 없이도 다국어 처방전 라벨을 고도로 정밀하게 해석.
* **openFDA API**: AI의 환각(Hallucination)을 제어하고 공인된 의학 정보를 제공하는 Grounding Source.
* **Supabase RLS**: 민감한 의료 데이터에 대한 엄격한 행 단위 보안 적용.

---

## 4. Cursor AI Operating Protocol (Mandatory)
Cursor는 매 작업 시 반드시 다음 **4개의 게이트(Gates)**를 통과해야 합니다:

1.  **Context Check**: 시작 전 `@AI.md`와 `@Project_Plan.md`를 참조하여 현재 단계의 목적을 확인한다.
2.  **Architecture Interview**: 코딩 전 3가지 설계 옵션(MCQ)을 제시하고 질문자(Senior Eng)의 승인을 받는다.
3.  **Logic First**: 코드 작성 전 의사코드(Pseudocode)와 예외 케이스(예: 약 이름 오인식, 시간대 충돌 등) 분석 보고를 먼저 수행한다.
4.  **Token Efficiency**: Diff 기반 수정을 원칙으로 하며, 불필요한 파일 전체 재작성을 금지한다.

---

### 💡 PM의 보고: 프로젝트 준비 완료

이제 **`.cursorrules`**, **`AI.md`**, 그리고 **`Project_Plan.md`**까지 모든 설계 자산이 준비되었습니다. 이 파일들을 프로젝트 루트에 넣는 순간, 개발이 공식적으로 시작됩니다.

**[Next Step]**
질문자님(Senior Engineer), 이제 Cursor에게 첫 명령을 내릴 차례입니다.

* **명령 내용**: "Project Plan의 **Phase 1 [Task 1, 3]**을 참고하여 Next.js 프로젝트 초기화와 Supabase 스키마 설계를 위한 인터뷰를 시작해줘."

이대로 진행할까요? 아니면 프로젝트 플랜에서 수정하고 싶은 디테일이 있으신가요? (Confidence Score: 10/10)