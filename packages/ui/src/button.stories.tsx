import { Button } from "./button";

const meta = {
  title: "UI/Button",
  component: Button,
  tags: ["autodocs"],
  args: {
    children: "Continue",
  },
};

export default meta;

export const Primary = {};

export const Outline = {
  args: {
    variant: "outline",
  },
};

export const Secondary = {
  args: {
    variant: "secondary",
  },
};

export const Ghost = {
  args: {
    variant: "ghost",
  },
};
