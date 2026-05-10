diagram:

```mermaid
flowchart TD;

%% --- Actors ---
Everyone([Everyone<br/>Public Fairness Dashboard])

subgraph Candidate["Candidate"]
    C1[Register]
    C2[Upload CV]
    C3[Review & Update Profile]
    C4[Wait for Matches]
    C5{Match Notification?}
    C6[View Match Explanation<br/>+ Score]
    C7[View Structured Rejection<br/>+ Reason]
    C8[Appeal or Correct Profile]
end

subgraph Engine["Match Engine<br/>(Fair Hiring Protocol)"]
    E1[Interpret CVs & Job Briefs]
    E2[Score Candidates]
    E3[Notify Candidates > Threshold]
    E4[Notify Recruiter of Matches]
    E5{Recruiter Response?}
    E6[Ghosting Detection]
    E7[Update Fairness Metrics]
    E8[Audit Logs & Transparency]
end

subgraph Recruiter["Recruiter / Company"]
    R1[Create Vacancy]
    R2[Review Job Brief]
    R3[Receive Matches]
    R4{Interested<br/>or Rejected?}
    R5[Interested → Notify Candidate]
    R6[Rejected → Provide Structured Reason]
    R7[Ghost (No Response)]
    R8[Behaviour Feeds<br/>Company Fairness Score]
end

%% --- Everyone lane ---
Everyone --> E7

%% --- Candidate Flow ---
C1 --> C2 --> C3 --> C4
C4 --> E2

E3 --> C5

C5 -->|Yes| C6
C5 -->|Rejected| C7
C7 --> C8
C6 --> C8

%% --- Recruiter Flow ---
R1 --> R2 --> E1
E4 --> R3 --> R4

R4 -->|Interested| R5 --> E7
R4 -->|Rejected| R6 --> E7
R4 -->|No Response| R7 --> E6 --> E7

%% --- Engine Flow ---
E1 --> E2 --> E3 --> E4
E5 --> E6 --> E7 --> E8
```