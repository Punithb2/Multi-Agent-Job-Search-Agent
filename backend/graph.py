from langgraph.graph import StateGraph, END

# Import the blueprint
from state import AgentState

# Import all the worker nodes we just built
from agents import (
    supervisor_node,
    job_researcher_node,
    skill_gap_node,
    resume_tailor_node,
    cover_letter_node
)

# 1. Initialize the Graph
workflow = StateGraph(AgentState)

# 2. Add all nodes
workflow.add_node("supervisor", supervisor_node)
workflow.add_node("researcher", job_researcher_node)
workflow.add_node("skill_gap", skill_gap_node)
workflow.add_node("resume_tailor", resume_tailor_node)
workflow.add_node("cover_letter", cover_letter_node)

# 3. Define the Flow
workflow.set_entry_point("supervisor")

# The supervisor dynamically chooses the next path
workflow.add_conditional_edges(
    "supervisor",
    lambda state: state["next_agent"],
    {
        "researcher": "researcher",
        "skill_gap": "skill_gap",
        "resume_tailor": "resume_tailor",
        "cover_letter": "cover_letter",
        "FINISH": END
    }
)

# Every worker MUST report back to the supervisor when finished
workflow.add_edge("researcher", "supervisor")
workflow.add_edge("skill_gap", "supervisor")
workflow.add_edge("resume_tailor", "supervisor")
workflow.add_edge("cover_letter", "supervisor")

# 4. Compile and export the final application
workflow_app = workflow.compile()