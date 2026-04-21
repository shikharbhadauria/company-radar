from typing import TypedDict, List
from langgraph.graph import StateGraph, END
from nodes.planner import planner
from nodes.search_embed import search_embed
from nodes.synthesizer import synthesizer


class ResearchState(TypedDict):
    original_query: str
    company_name: str
    user_profile: dict
    session_id: str
    sub_queries: List[str]
    collected_chunks: List[dict]
    iteration: int
    gaps: List[str]
    final_report: str


def should_continue(state: ResearchState) -> str:
    if state["iteration"] >= 3:
        return END
    if not state.get("gaps"):
        return END
    return "planner"


def increment_iteration(state: ResearchState) -> ResearchState:
    return {**state, "iteration": state["iteration"] + 1}


def build_graph():
    workflow = StateGraph(ResearchState)

    workflow.add_node("planner", planner)
    workflow.add_node("search_embed", search_embed)
    workflow.add_node("synthesizer", synthesizer)
    workflow.add_node("increment", increment_iteration)

    workflow.set_entry_point("planner")
    workflow.add_edge("planner", "search_embed")
    workflow.add_edge("search_embed", "synthesizer")
    workflow.add_edge("synthesizer", "increment")
    workflow.add_conditional_edges(
        "increment",
        should_continue,
        {END: END, "planner": "planner"},
    )

    return workflow.compile()


research_graph = build_graph()
