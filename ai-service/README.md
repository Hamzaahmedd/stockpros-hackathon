# Stock App AI Services

## Table of Contents
- [Project Overview](#project-overview)
- [Features](#features)
- [Technologies Used](#technologies-used)
- [Prerequisites](#prerequisites)
- [Installation](#installation)

---

## Project Overview
Machine Learning models and pipelines for stock prediction. Includes data preprocessing, feature engineering, training, evaluation, and deployment-ready forecasting models integrated with the backend.

## Features
- Time-series forecasting (GRU model)
- Data preprocessing & feature engineering
- Model training scripts
- Evaluation metrics (MSE, RMSE, MAE)
- Model export for backend deployment

## Technologies Used
- Pandas, NumPy
- Scikit-learn
- TensorFlow

## Prerequisites
- Python 3.11
- AlphaVantage API Key
  
## Installation

1. Clone the repository:
```bash
git clone https://github.com/Stock-App-Platform/stock-ml.git
```

2. Create and Activate Virtual Environment (Windows)
```bash
python -m venv venv
venv\Scripts\activate   
```

3. Install Dependencies
The application relies on fastapi, uvicorn, gunicorn, and ML libraries such as tensorflow or keras, which should be defined in requirements.txt.

```bash
pip install -r requirements.txt
```

4. Configure environment variables
   Create a `.env` file with the following variables:

```
ALPHAVANTAGE_API_KEY=your_api_key
ALPHA_URL=the_alpha_api_url
```

## Running the Application

### Development Mode

```bash
 uvicorn app.main:app --host localhost --port 8000 --reload
 ```

### Training Models

Standalone maintenance scripts live in the `tools/` directory.

```bash
# Train a GRU model, convert to ONNX and upload to Supabase
python tools/train_script.py --symbol AAPL

# Manually convert an existing Keras model to ONNX
python tools/convert.py <input_model_path> <output_model_path>
```
