import tensorflow as tf
import tf2onnx
import onnx
import sys
import os

def convert_to_onnx(model_path, output_path):
    if not os.path.exists(model_path):
        print(f"Error: Model file {model_path} not found.")
        return

    print(f"Loading model from {model_path}...")
    model = tf.keras.models.load_model(model_path)
    
    # Define the input signature based on the model's expected shape
    # Using None for batch size
    input_signature = [tf.TensorSpec(model.input_shape, tf.float32, name="input")]
    
    print("Converting to ONNX...")
    model_proto, _ = tf2onnx.convert.from_keras(model, input_signature=input_signature, opset=13)
    
    print(f"Saving ONNX model to {output_path}...")
    onnx.save(model_proto, output_path)
    print("Conversion complete!")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python convert.py <input_model_path> <output_model_path>")
        print("Example: python convert.py app/models/saved/gru_AAPL_model.h5 app/models/saved/gru_AAPL_model.onnx")
        sys.exit(1)
    
    model_in = sys.argv[1]
    model_out = sys.argv[2]
    convert_to_onnx(model_in, model_out)
