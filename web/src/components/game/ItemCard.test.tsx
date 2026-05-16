import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Item, Tier } from "@/types/game";
import { ItemCard } from "./ItemCard";

const baseItem: Item = {
  id: "sword",
  name: "Sword of Test",
  tier: "bronze",
  size: 1,
  tags: ["Weapon"],
  buyCost: 3,
  sellValue: 1,
};

const TIER_RING: Record<Tier, string> = {
  bronze: "ring-amber-700/80",
  silver: "ring-slate-300/80",
  gold: "ring-yellow-300/80",
  diamond: "ring-cyan-300/80",
};

describe("ItemCard", () => {
  describe("tier → ring color", () => {
    for (const tier of ["bronze", "silver", "gold", "diamond"] as const) {
      it(`renders the ${tier} ring class`, () => {
        render(<ItemCard item={{ ...baseItem, id: `item-${tier}`, name: `Item ${tier}`, tier }} />);
        const button = screen.getByRole("button", { name: new RegExp(`Item ${tier}`) });
        expect(button.className).toContain(TIER_RING[tier]);
      });
    }
  });

  it("does not show the tooltip until hovered", () => {
    render(<ItemCard item={baseItem} />);
    expect(screen.queryByText(/Buy 3g/)).not.toBeInTheDocument();
  });

  it("shows the tooltip on hover and hides it on mouse leave", async () => {
    const user = userEvent.setup();
    render(<ItemCard item={baseItem} />);
    const button = screen.getByRole("button", { name: /Sword of Test/ });

    await user.hover(button);
    const tooltip = await screen.findByText(/Buy 3g · Sell 1g/);
    expect(tooltip).toBeInTheDocument();

    await user.unhover(button);
    // AnimatePresence may keep the node mounted briefly for the exit
    // animation — waitFor polls until it actually leaves the DOM.
    await waitFor(() => {
      expect(screen.queryByText(/Buy 3g · Sell 1g/)).not.toBeInTheDocument();
    });
  });

  it("replaces the buy/sell line with a sellPreview when provided", async () => {
    const user = userEvent.setup();
    render(<ItemCard item={baseItem} sellPreview={4} />);
    const button = screen.getByRole("button", { name: /Sword of Test/ });

    await user.hover(button);
    expect(await screen.findByText(/Sell for 4g/)).toBeInTheDocument();
    expect(screen.queryByText(/Buy 3g · Sell 1g/)).not.toBeInTheDocument();
  });

  it("fires onClick when the card is clicked", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<ItemCard item={baseItem} onClick={onClick} />);

    await user.click(screen.getByRole("button", { name: /Sword of Test/ }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("disables clicks when disabled is true", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<ItemCard item={baseItem} disabled onClick={onClick} />);

    const button = screen.getByRole("button", { name: /Sword of Test/ });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});
